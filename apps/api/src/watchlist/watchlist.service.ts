import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AlertType, Prisma, User } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class WatchlistService {
  constructor(private readonly prisma: PrismaService) {}

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
      status: alert.status,
      lastCheckedAt: alert.lastCheckedAt?.toISOString() ?? null,
      triggeredAt: alert.triggeredAt?.toISOString() ?? null,
      triggeredPrice: this.toNumber(alert.triggeredPrice),
      createdAt: alert.createdAt.toISOString(),
    }));
  }

  async createAlert(userId: string, productId: string, alertType: AlertType, thresholdValue: number) {
    if (!Number.isFinite(thresholdValue) || thresholdValue <= 0) {
      throw new BadRequestException('thresholdValue must be a positive number');
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

    const alert = await this.prisma.priceAlert.create({
      data: {
        userId,
        canonicalProductId: productId,
        alertType,
        thresholdValue: this.toDecimal(thresholdValue),
      },
    });

    return {
      id: alert.id,
      userId: alert.userId,
      canonicalProductId: alert.canonicalProductId,
      canonicalProduct: product,
      alertType: alert.alertType,
      thresholdValue: this.toNumber(alert.thresholdValue) ?? thresholdValue,
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
        currency: 'USD',
      },
      _count: {
        sourceListings: product._count.sourceListings,
      },
    };
  }

  private toNumber(value: Prisma.Decimal | number | null | undefined) {
    if (value == null) return null;
    return Number(value);
  }

  private toDecimal(value: number) {
    return new Prisma.Decimal(value.toFixed(2));
  }
}
