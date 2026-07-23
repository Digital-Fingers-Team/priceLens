import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AffiliateConfigData } from './interfaces';

export interface UpsertAffiliateConfigInput {
  providerKey: string;
  affiliateId: string;
  trackingParams?: Record<string, string>;
  isActive?: boolean;
}

/**
 * CRUD over the affiliate_configs table -- the "data" half of the affiliate
 * system (which affiliate id / tracking params a store uses). Kept separate
 * from AffiliateService, which owns the "behavior" half (turning that data
 * plus a provider into an actual redirect).
 */
@Injectable()
export class AffiliateConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active config for a platform, or null if none exists / it's disabled -- never throws. */
  async getActiveConfig(platformId: string): Promise<AffiliateConfigData | null> {
    const config = await this.prisma.affiliateConfig.findUnique({ where: { platformId } });
    if (!config || !config.isActive) return null;
    return this.toData(config);
  }

  async list(): Promise<Array<AffiliateConfigData & { platformSlug: string; platformName: string }>> {
    const configs = await this.prisma.affiliateConfig.findMany({
      include: { platform: { select: { slug: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return configs.map((config) => ({
      ...this.toData(config),
      platformSlug: config.platform.slug,
      platformName: config.platform.name,
    }));
  }

  async upsert(platformId: string, input: UpsertAffiliateConfigInput): Promise<AffiliateConfigData> {
    if (!input.providerKey?.trim()) {
      throw new BadRequestException('providerKey is required');
    }
    if (!input.affiliateId?.trim()) {
      throw new BadRequestException('affiliateId is required');
    }

    const platform = await this.prisma.platform.findUnique({ where: { id: platformId } });
    if (!platform) {
      throw new NotFoundException(`Platform with id "${platformId}" not found`);
    }

    const trackingParams = this.normalizeTrackingParams(input.trackingParams);

    const config = await this.prisma.affiliateConfig.upsert({
      where: { platformId },
      create: {
        platformId,
        providerKey: input.providerKey.trim(),
        affiliateId: input.affiliateId.trim(),
        trackingParams,
        isActive: input.isActive ?? true,
      },
      update: {
        providerKey: input.providerKey.trim(),
        affiliateId: input.affiliateId.trim(),
        trackingParams,
        isActive: input.isActive ?? true,
      },
    });

    return this.toData(config);
  }

  private normalizeTrackingParams(trackingParams: Record<string, string> | undefined): Prisma.InputJsonValue {
    if (!trackingParams || typeof trackingParams !== 'object') return {};

    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(trackingParams)) {
      if (typeof key === 'string' && key.trim()) {
        normalized[key.trim()] = String(value);
      }
    }
    return normalized;
  }

  private toData(config: {
    platformId: string;
    providerKey: string;
    affiliateId: string;
    trackingParams: Prisma.JsonValue;
    isActive: boolean;
  }): AffiliateConfigData {
    return {
      platformId: config.platformId,
      providerKey: config.providerKey,
      affiliateId: config.affiliateId,
      trackingParams: (config.trackingParams ?? {}) as Record<string, string>,
      isActive: config.isActive,
    };
  }
}
