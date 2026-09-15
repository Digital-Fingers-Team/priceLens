import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PriceIntelligenceService } from '../intelligence/price-intelligence.service';
import {
  computeHistoryStats,
  filterPriceOutliers,
  percentileRankOf,
} from '../intelligence/price-statistics';

/**
 * The shape enterprise customers integrate against.
 *
 * Deliberately stable and self-describing: every nullable field means "we do
 * not have this", never zero, and `data_quality` states how much the answer
 * rests on. An integration that cannot tell a real 0 from a missing value is
 * one that will eventually make a bad decision with our data.
 */
export interface ProductMarketResponse {
  sku: string;
  product: {
    id: string;
    title: string;
    brand: string | null;
    category: string;
  };
  currency: string;
  lowest_price: number | null;
  highest_price: number | null;
  median_price: number | null;
  average_price: number | null;
  competitors: Array<{
    retailer: string;
    retailer_slug: string;
    price: number;
    in_stock: boolean | null;
    url: string;
    last_seen: string;
  }>;
  availability: {
    in_stock_retailers: number;
    out_of_stock_retailers: number;
    unknown_retailers: number;
  };
  historical_data: {
    window_days: number;
    low: number | null;
    high: number | null;
    average: number | null;
    /** Distinct days with an observation; the honest sample size. */
    days_observed: number;
    series: Array<{ date: string; min: number; max: number }>;
  } | null;
  price_position: {
    /** Where the cheapest live price sits within its own recorded history. */
    percentile_vs_history: number | null;
    vs_median_pct: number | null;
  };
  data_quality: {
    retailers_tracked: number;
    /** Listings excluded as probable mismatches, with the reason. */
    listings_excluded: number;
    sufficient_for_verdict: boolean;
    note: string;
  };
}

@Injectable()
export class MarketDataService {
  private readonly currency: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly intelligence: PriceIntelligenceService,
    config: ConfigService,
  ) {
    this.currency = config.get<string>('pricing.fxBaseCurrency', 'EGP');
  }

  /**
   * Resolves the `{sku}` path segment.
   *
   * Accepts our canonical id, our slug, or a GTIN/UPC/EAN/MPN, because an
   * integrator has whatever identifier their own system holds and should not
   * have to maintain a mapping table just to call us.
   */
  private async resolveProduct(sku: string) {
    const product = await this.prisma.canonicalProduct.findFirst({
      where: {
        OR: [
          { id: sku },
          { slug: sku },
          { gtin: sku },
          { upc: sku },
          { ean: sku },
          { mpn: { equals: sku, mode: 'insensitive' } },
          { sku: { equals: sku, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        slug: true,
        title: true,
        brand: true,
        category: { select: { name: true } },
      },
    });

    if (!product) throw new NotFoundException(`No product matches "${sku}"`);
    return product;
  }

  async getProductMarket(sku: string, historyDays = 90): Promise<ProductMarketResponse> {
    const product = await this.resolveProduct(sku);

    const listings = await this.prisma.sourceListing.findMany({
      where: {
        canonicalProductId: product.id,
        priceUsd: { not: null },
        matchStatus: { in: [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT] },
      },
      select: {
        platformId: true,
        priceUsd: true,
        inStock: true,
        externalUrl: true,
        lastSeenAt: true,
        platform: { select: { name: true, slug: true } },
      },
      orderBy: { priceUsd: 'asc' },
    });

    // One row per retailer — their cheapest — so a retailer listing many
    // variants cannot distort the distribution.
    const perRetailer = new Map<string, (typeof listings)[number]>();
    for (const listing of listings) {
      if (!perRetailer.has(listing.platformId)) perRetailer.set(listing.platformId, listing);
    }

    const { kept, excluded } = filterPriceOutliers([...perRetailer.values()], (listing) =>
      Number(listing.priceUsd),
    );

    const prices = kept.map((listing) => Number(listing.priceUsd)).sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const median =
      prices.length === 0
        ? null
        : prices.length % 2 === 0
          ? (prices[mid - 1] + prices[mid]) / 2
          : prices[mid];

    const points = await this.intelligence.getDailySeries(product.id, historyDays);
    const stats = computeHistoryStats(points);
    const cheapest = prices[0] ?? null;

    return {
      sku,
      product: {
        id: product.id,
        title: product.title,
        brand: product.brand,
        category: product.category.name,
      },
      currency: this.currency,
      lowest_price: cheapest,
      highest_price: prices[prices.length - 1] ?? null,
      median_price: median,
      average_price: prices.length
        ? prices.reduce((sum, value) => sum + value, 0) / prices.length
        : null,
      competitors: kept.map((listing) => ({
        retailer: listing.platform.name,
        retailer_slug: listing.platform.slug,
        price: Number(listing.priceUsd),
        in_stock: listing.inStock,
        url: listing.externalUrl,
        last_seen: listing.lastSeenAt.toISOString(),
      })),
      availability: {
        in_stock_retailers: kept.filter((listing) => listing.inStock === true).length,
        out_of_stock_retailers: kept.filter((listing) => listing.inStock === false).length,
        // Reported explicitly rather than folded into "in stock": most stores
        // we track do not publish stock at all.
        unknown_retailers: kept.filter((listing) => listing.inStock === null).length,
      },
      historical_data: stats
        ? {
            window_days: historyDays,
            low: stats.low,
            high: stats.high,
            average: stats.average,
            days_observed: stats.dayCount,
            series: points.map((point) => ({ date: point.date, min: point.min, max: point.max })),
          }
        : null,
      price_position: {
        percentile_vs_history:
          cheapest != null && points.length > 0
            ? percentileRankOf(points.map((point) => point.min), cheapest)
            : null,
        vs_median_pct: cheapest != null && median ? ((cheapest - median) / median) * 100 : null,
      },
      data_quality: {
        retailers_tracked: kept.length,
        listings_excluded: excluded.length,
        sufficient_for_verdict: (stats?.dayCount ?? 0) >= 10 && (stats?.spanDays ?? 0) >= 14,
        note:
          'All figures are derived from listings PriceLens observed directly. Null means we have no ' +
          'observation, never zero. Excluded listings were filtered as probable product mismatches.',
      },
    };
  }

  /** Market statistics across a brand or category. */
  async getMarketStats(filters: { brand?: string; categorySlug?: string }) {
    const products = await this.prisma.canonicalProduct.findMany({
      where: {
        ...(filters.brand ? { brand: { equals: filters.brand, mode: 'insensitive' } } : {}),
        ...(filters.categorySlug ? { category: { slug: filters.categorySlug } } : {}),
        sourceListings: {
          some: { priceUsd: { not: null }, matchStatus: { in: [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT] } },
        },
      },
      select: {
        id: true,
        sourceListings: {
          where: { priceUsd: { not: null } },
          select: { priceUsd: true, platformId: true },
          orderBy: { priceUsd: 'asc' },
          take: 1,
        },
      },
      take: 1000,
    });

    const prices = products
      .map((product) => Number(product.sourceListings[0]?.priceUsd))
      .filter((price) => Number.isFinite(price) && price > 0)
      .sort((a, b) => a - b);

    if (prices.length === 0) {
      return {
        currency: this.currency,
        products_tracked: 0,
        average_price: null,
        median_price: null,
        lowest_price: null,
        highest_price: null,
        note: 'No tracked products match those filters.',
      };
    }

    const mid = Math.floor(prices.length / 2);

    return {
      currency: this.currency,
      products_tracked: prices.length,
      average_price: prices.reduce((sum, value) => sum + value, 0) / prices.length,
      median_price:
        prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid],
      lowest_price: prices[0],
      highest_price: prices[prices.length - 1],
      note: 'Each product contributes its cheapest tracked listing.',
    };
  }
}
