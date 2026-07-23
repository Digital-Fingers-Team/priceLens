import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RawConversion } from './interfaces';
import { ConversionProviderRegistry } from './providers/conversion-provider.registry';

const FIRST_POLL_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface ConversionListItem {
  id: string;
  clickId: string;
  networkKey: string;
  status: string;
  saleAmount: number | null;
  commissionAmount: number | null;
  currency: string;
  occurredAt: string;
  sourceListingId: string;
  canonicalProductId: string | null;
  platformId: string;
}

export interface ConversionSummaryItem {
  status: string;
  count: number;
  totalCommission: number | null;
}

export interface PollResult {
  networkKey: string;
  fetched: number;
  reconciled: number;
}

/**
 * Matches conversions reported by affiliate networks back to the
 * AffiliateClick they belong to, via whatever sub-id/click-id the network's
 * data carries. Two ways conversions arrive: a scheduled poll (see
 * AffiliateConversionScheduler) and an inbound webhook (see
 * AffiliateConversionsController) -- both funnel through reconcileOne so the
 * upsert/matching logic only lives in one place.
 */
@Injectable()
export class ConversionReconciliationService {
  private readonly logger = new Logger(ConversionReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ConversionProviderRegistry,
  ) {}

  async pollAll(): Promise<PollResult[]> {
    const results: PollResult[] = [];

    for (const provider of this.registry.all()) {
      if (!provider.fetchConversions) continue;

      const since = await this.getLastWatermark(provider.networkKey);
      const conversions = await provider.fetchConversions(since);

      let reconciled = 0;
      for (const conversion of conversions) {
        if (await this.reconcileOne(provider.networkKey, conversion)) reconciled += 1;
      }

      results.push({ networkKey: provider.networkKey, fetched: conversions.length, reconciled });
    }

    return results;
  }

  async handleWebhook(networkKey: string, payload: Record<string, unknown>): Promise<boolean> {
    const provider = this.registry.resolve(networkKey);
    if (!provider.parseWebhookPayload) {
      throw new BadRequestException(`Network "${networkKey}" does not support webhook postbacks`);
    }

    const conversion = provider.parseWebhookPayload(payload);
    if (!conversion) return false;

    return this.reconcileOne(networkKey, conversion);
  }

  async list(status?: 'PENDING' | 'APPROVED' | 'REVERSED'): Promise<ConversionListItem[]> {
    const conversions = await this.prisma.affiliateConversion.findMany({
      where: status ? { status } : undefined,
      include: {
        click: { select: { sourceListingId: true, canonicalProductId: true, platformId: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });

    return conversions.map((conversion) => ({
      id: conversion.id,
      clickId: conversion.clickId,
      networkKey: conversion.networkKey,
      status: conversion.status,
      saleAmount: this.toNumber(conversion.saleAmount),
      commissionAmount: this.toNumber(conversion.commissionAmount),
      currency: conversion.currency,
      occurredAt: conversion.occurredAt.toISOString(),
      sourceListingId: conversion.click.sourceListingId,
      canonicalProductId: conversion.click.canonicalProductId,
      platformId: conversion.click.platformId,
    }));
  }

  async summary(): Promise<ConversionSummaryItem[]> {
    const grouped = await this.prisma.affiliateConversion.groupBy({
      by: ['status'],
      _sum: { commissionAmount: true },
      _count: { _all: true },
    });

    return grouped.map((group) => ({
      status: group.status,
      count: group._count._all,
      totalCommission: this.toNumber(group._sum.commissionAmount),
    }));
  }

  private async reconcileOne(networkKey: string, conversion: RawConversion): Promise<boolean> {
    const click = await this.prisma.affiliateClick.findUnique({ where: { id: conversion.clickId } });
    if (!click) {
      this.logger.warn(
        `Conversion ${conversion.externalActionId} from "${networkKey}" references unknown click ` +
          `"${conversion.clickId}" -- skipping (network sub-id and AffiliateClick.id didn't match)`,
      );
      return false;
    }

    await this.prisma.affiliateConversion.upsert({
      where: {
        networkKey_externalActionId: {
          networkKey,
          externalActionId: conversion.externalActionId,
        },
      },
      create: {
        clickId: conversion.clickId,
        networkKey,
        externalActionId: conversion.externalActionId,
        status: conversion.status,
        saleAmount: conversion.saleAmount,
        commissionAmount: conversion.commissionAmount,
        currency: conversion.currency,
        occurredAt: conversion.occurredAt,
      },
      update: {
        status: conversion.status,
        saleAmount: conversion.saleAmount,
        commissionAmount: conversion.commissionAmount,
      },
    });

    return true;
  }

  /** First-ever poll for a network has no prior rows to anchor on, so look back 30 days instead of returning nothing. */
  private async getLastWatermark(networkKey: string): Promise<Date> {
    const latest = await this.prisma.affiliateConversion.findFirst({
      where: { networkKey },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true },
    });

    return latest?.occurredAt ?? new Date(Date.now() - FIRST_POLL_LOOKBACK_MS);
  }

  private toNumber(value: Prisma.Decimal | null): number | null {
    return value == null ? null : Number(value);
  }
}
