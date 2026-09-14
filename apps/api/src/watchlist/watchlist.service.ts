import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertStatus, AlertType, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { PlanLimitExceededException, UpgradeRequiredException } from '../billing/billing.errors';
import { isWithinLimit } from '../billing/plan-limits';

/**
 * Types whose threshold is a percentage. Declared as a typed Set because a
 * bare array literal narrows to its own literal union and then refuses the
 * wider AlertType.
 */
const PERCENTAGE_THRESHOLD_TYPES: ReadonlySet<AlertType> = new Set([
  AlertType.PRICE_DROP_PERCENT,
  AlertType.PRICE_INCREASE,
  AlertType.MAJOR_DISCOUNT,
]);

export interface CreateAlertInput {
  alertType: AlertType;
  thresholdValue: number;
  repeatable?: boolean;
  cooldownHours?: number;
}

@Injectable()
export class WatchlistService {
  private readonly logger = new Logger(WatchlistService.name);
  /** Prices are stored normalised to the FX base currency, not USD. */
  private readonly currency: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    config: ConfigService,
  ) {
    this.currency = config.get<string>('pricing.fxBaseCurrency', 'EGP');
  }

  async getWatchlist(userId: string) {
    const items = await this.prisma.watchlistItem.findMany({
      where: { userId },
      include: {
        canonicalProduct: {
          include: {
            category: true,
            _count: {
              select: { sourceListings: true },
            },
            sourceListings: {
              where: {
                priceUsd: { not: null },
                matchStatus: { in: ['ACCEPTED', 'MANUAL_ACCEPT'] },
              },
              select: { priceUsd: true },
              orderBy: { priceUsd: 'asc' },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => ({
      id: item.id,
      userId: item.userId,
      canonicalProductId: item.canonicalProductId,
      note: item.note,
      bestPrice: this.toNumber(item.canonicalProduct.sourceListings[0]?.priceUsd ?? null),
      createdAt: item.createdAt.toISOString(),
      canonicalProduct: this.mapCanonicalProduct(item.canonicalProduct),
    }));
  }

  async addToWatchlist(userId: string, productId: string, note?: string) {
    // Only a *new* item consumes allowance -- re-adding something already
    // tracked (which this method upserts) must never be blocked, or a user at
    // their cap could not edit a note on an existing item.
    const [{ limits }, alreadyTracked] = await Promise.all([
      this.entitlements.getEntitlements(userId),
      this.prisma.watchlistItem.findUnique({
        where: { userId_canonicalProductId: { userId, canonicalProductId: productId } },
        select: { id: true },
      }),
    ]);

    if (!alreadyTracked) {
      const current = await this.prisma.watchlistItem.count({ where: { userId } });
      if (!isWithinLimit(current, limits.trackedProducts)) {
        throw new PlanLimitExceededException('tracked products', current, limits.trackedProducts as number);
      }
    }

    const product = await this.prisma.canonicalProduct.findUnique({
      where: { id: productId },
      include: {
        category: true,
        _count: {
          select: { sourceListings: true },
        },
        sourceListings: {
          where: {
            priceUsd: { not: null },
            matchStatus: { in: ['ACCEPTED', 'MANUAL_ACCEPT'] },
          },
          select: { priceUsd: true },
          orderBy: { priceUsd: 'asc' },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with id "${productId}" not found`);
    }

    const item = await this.prisma.watchlistItem.upsert({
      where: {
        userId_canonicalProductId: {
          userId,
          canonicalProductId: productId,
        },
      },
      create: {
        userId,
        canonicalProductId: productId,
        note: note?.trim() || null,
      },
      update: {
        note: note?.trim() || undefined,
      },
    });

    return {
      id: item.id,
      userId: item.userId,
      canonicalProductId: item.canonicalProductId,
      note: item.note,
      bestPrice: this.toNumber(product.sourceListings[0]?.priceUsd ?? null),
      createdAt: item.createdAt.toISOString(),
      canonicalProduct: this.mapCanonicalProduct(product),
    };
  }

  async removeFromWatchlist(userId: string, productId: string) {
    const item = await this.prisma.watchlistItem.findUnique({
      where: {
        userId_canonicalProductId: {
          userId,
          canonicalProductId: productId,
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Watchlist item not found');
    }

    await this.prisma.watchlistItem.delete({
      where: { id: item.id },
    });
  }

  async getAlerts(userId: string) {
    const alerts = await this.prisma.priceAlert.findMany({
      where: { userId },
      include: {
        canonicalProduct: {
          select: {
            id: true,
            title: true,
            slug: true,
            imageUrl: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    return alerts.map((alert) => ({
      id: alert.id,
      userId: alert.userId,
      canonicalProductId: alert.canonicalProductId,
      canonicalProduct: alert.canonicalProduct,
      alertType: alert.alertType,
      thresholdValue: this.toNumber(alert.thresholdValue) ?? 0,
      repeatable: alert.repeatable,
      cooldownHours: alert.cooldownHours,
      status: alert.status,
      lastCheckedAt: alert.lastCheckedAt?.toISOString() ?? null,
      triggeredAt: alert.triggeredAt?.toISOString() ?? null,
      triggeredPrice: this.toNumber(alert.triggeredPrice),
      createdAt: alert.createdAt.toISOString(),
    }));
  }

  async createAlert(userId: string, productId: string, input: CreateAlertInput) {
    const { alertType, thresholdValue } = input;

    // RESTOCK has no numeric threshold -- it fires on a stock transition --
    // so it is the one type where a zero value is legitimate.
    const needsThreshold = alertType !== AlertType.RESTOCK;
    if (needsThreshold && (!Number.isFinite(thresholdValue) || thresholdValue <= 0)) {
      throw new BadRequestException('thresholdValue must be a positive number');
    }

    // Percentage-based types are bounded: a "90% drop" alert would never fire
    // and silently look broken to the user.
    if (PERCENTAGE_THRESHOLD_TYPES.has(alertType) && thresholdValue > 95) {
      throw new BadRequestException('A percentage threshold must be between 1 and 95');
    }

    const { limits } = await this.entitlements.getEntitlements(userId);

    if (!limits.alertTypes.includes(alertType)) {
      throw new UpgradeRequiredException(
        `${alertType} alerts are not included in your current plan.`,
      );
    }

    const activeCount = await this.prisma.priceAlert.count({
      where: { userId, status: AlertStatus.ACTIVE },
    });
    if (!isWithinLimit(activeCount, limits.activeAlerts)) {
      throw new PlanLimitExceededException('active alerts', activeCount, limits.activeAlerts as number);
    }

    const product = await this.prisma.canonicalProduct.findUnique({
      where: { id: productId },
      select: {
        id: true,
        title: true,
        slug: true,
        imageUrl: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with id "${productId}" not found`);
    }

    // Seed the stock state so a RESTOCK alert cannot fire on its first
    // evaluation just because the product happens to be available now.
    const currentStock =
      alertType === AlertType.RESTOCK ? await this.getCurrentStockState(productId) : null;

    const alert = await this.prisma.priceAlert.create({
      data: {
        userId,
        canonicalProductId: productId,
        alertType,
        thresholdValue: this.toDecimal(needsThreshold ? thresholdValue : 0),
        repeatable: input.repeatable ?? false,
        cooldownHours: Math.min(Math.max(input.cooldownHours ?? 24, 1), 720),
        lastSeenInStock: currentStock,
      },
    });

    return {
      id: alert.id,
      userId: alert.userId,
      canonicalProductId: alert.canonicalProductId,
      canonicalProduct: product,
      alertType: alert.alertType,
      thresholdValue: this.toNumber(alert.thresholdValue) ?? thresholdValue,
      repeatable: alert.repeatable,
      cooldownHours: alert.cooldownHours,
      status: alert.status,
      lastCheckedAt: alert.lastCheckedAt?.toISOString() ?? null,
      triggeredAt: alert.triggeredAt?.toISOString() ?? null,
      triggeredPrice: this.toNumber(alert.triggeredPrice),
      createdAt: alert.createdAt.toISOString(),
    };
  }

  async deleteAlert(userId: string, alertId: string) {
    const alert = await this.prisma.priceAlert.findFirst({
      where: {
        id: alertId,
        userId,
      },
    });

    if (!alert) {
      throw new NotFoundException('Price alert not found');
    }

    await this.prisma.priceAlert.delete({
      where: { id: alert.id },
    });
  }

  private mapCanonicalProduct(product: {
    id: string;
    slug: string;
    categoryId: string;
    title: string;
    brand: string | null;
    model: string | null;
    gtin: string | null;
    upc: string | null;
    ean: string | null;
    mpn: string | null;
    attributes: Prisma.JsonValue;
    imageUrl: string | null;
    thumbnailUrl: string | null;
    tier: string;
    isVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
    category: {
      id: string;
      slug: string;
      name: string;
      parentId: string | null;
      level: number;
    };
    _count: {
      sourceListings: number;
    };
    sourceListings: Array<{
      priceUsd: Prisma.Decimal | null;
    }>;
  }) {
    const prices = product.sourceListings
      .map((listing) => this.toNumber(listing.priceUsd))
      .filter((value): value is number => value != null)
      .sort((a, b) => a - b);

    const avg =
      prices.length > 0
        ? prices.reduce((sum, value) => sum + value, 0) / prices.length
        : null;

    const median =
      prices.length === 0
        ? null
        : prices.length % 2 === 0
          ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
          : prices[Math.floor(prices.length / 2)];

    return {
      id: product.id,
      slug: product.slug,
      categoryId: product.categoryId,
      category: product.category,
      title: product.title,
      brand: product.brand,
      model: product.model,
      gtin: product.gtin,
      upc: product.upc,
      ean: product.ean,
      mpn: product.mpn,
      attributes: (product.attributes ?? {}) as Record<string, string | number | boolean>,
      imageUrl: product.imageUrl,
      thumbnailUrl: product.thumbnailUrl,
      tier: product.tier,
      isVerified: product.isVerified,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      priceStats: {
        min: prices[0] ?? null,
        max: prices[prices.length - 1] ?? null,
        avg,
        median,
        current: prices[0] ?? null,
        currency: this.currency,
      },
      _count: {
        sourceListings: product._count.sourceListings,
      },
    };
  }

  /**
   * Re-arm a one-shot alert that has already fired. Without this a triggered
   * alert is dead weight the user has to delete and recreate.
   */
  async reactivateAlert(userId: string, alertId: string) {
    const alert = await this.prisma.priceAlert.findFirst({ where: { id: alertId, userId } });
    if (!alert) throw new NotFoundException('Price alert not found');

    const { limits } = await this.entitlements.getEntitlements(userId);
    if (alert.status !== AlertStatus.ACTIVE) {
      const activeCount = await this.prisma.priceAlert.count({
        where: { userId, status: AlertStatus.ACTIVE },
      });
      if (!isWithinLimit(activeCount, limits.activeAlerts)) {
        throw new PlanLimitExceededException('active alerts', activeCount, limits.activeAlerts as number);
      }
    }

    const updated = await this.prisma.priceAlert.update({
      where: { id: alert.id },
      data: {
        status: AlertStatus.ACTIVE,
        triggeredAt: null,
        triggeredPrice: null,
        lastNotifiedAt: null,
        ...(alert.alertType === AlertType.RESTOCK
          ? { lastSeenInStock: await this.getCurrentStockState(alert.canonicalProductId) }
          : {}),
      },
    });

    return { id: updated.id, status: updated.status };
  }

  /** BOOL_OR across live listings; null when no store publishes stock. */
  private async getCurrentStockState(productId: string): Promise<boolean | null> {
    const rows = await this.prisma.sourceListing.findMany({
      where: {
        canonicalProductId: productId,
        matchStatus: { in: ['ACCEPTED', 'MANUAL_ACCEPT'] },
        priceUsd: { not: null },
      },
      select: { inStock: true },
    });

    if (rows.length === 0) return null;
    if (rows.every((row) => row.inStock === null)) return null;
    return rows.some((row) => row.inStock === true);
  }

  private toNumber(value: Prisma.Decimal | number | null | undefined) {
    if (value == null) return null;
    return Number(value);
  }

  private toDecimal(value: number) {
    return new Prisma.Decimal(value.toFixed(2));
  }
}
