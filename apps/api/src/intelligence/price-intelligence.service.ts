import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { EntitlementsService } from '../billing/entitlements.service';
import {
  BuyVerdict,
  DailyPricePoint,
  DiscountCheck,
  HistoryStats,
  computeBuyVerdict,
  computeHistoryStats,
  detectMisleadingDiscount,
} from './price-statistics';
import { DealScoreResult, computeDealScore } from './deal-score';

/** Listings we will show a price from. Matches the rest of the app's rule. */
const ACCEPTED_MATCHES: MatchStatus[] = [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT];

export interface CurrentMarket {
  best: number | null;
  median: number | null;
  average: number | null;
  highest: number | null;
  storeCount: number;
  inStock: boolean | null;
  currency: string;
  bestStore: { platformId: string; name: string; url: string } | null;
}

export interface ProductIntelligence {
  productId: string;
  currency: string;
  window: { days: number; truncated: boolean; maxDays: number | null };
  market: CurrentMarket;
  history: (HistoryStats & { points: DailyPricePoint[] }) | null;
  verdict: BuyVerdict;
  dealScore: DealScoreResult;
  discountCheck: DiscountCheck;
  /** True when history is too thin for the headline claims. */
  insufficientData: boolean;
}

@Injectable()
export class PriceIntelligenceService {
  private readonly logger = new Logger(PriceIntelligenceService.name);
  private readonly currency: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    config: ConfigService,
  ) {
    // Prices are stored normalised to the FX base currency (EGP in this
    // deployment) under the legacy column name `price_usd`. Reporting the
    // real currency here is what stops the UI mislabelling every figure.
    this.currency = config.get<string>('pricing.fxBaseCurrency', 'EGP');
  }

  /**
   * Everything the product page's intelligence panel needs, in one call.
   *
   * The history is aggregated to one row per day *in the database* rather
   * than loading every PriceHistory row into Node: a popular product tracked
   * across six stores accumulates tens of thousands of rows, and the daily
   * series is all any of the statistics actually consume.
   */
  async getProductIntelligence(
    productId: string,
    userId: string | null,
    requestedDays = 90,
  ): Promise<ProductIntelligence> {
    const product = await this.prisma.canonicalProduct.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException(`Product with id "${productId}" not found`);

    const window = await this.entitlements.resolveHistoryWindow(userId, requestedDays);

    const [points, market, advertisedWas] = await Promise.all([
      this.getDailySeries(productId, window.days),
      this.getCurrentMarket(productId),
      this.getAdvertisedPreviousPrice(productId),
    ]);

    const stats = computeHistoryStats(points);
    const verdict = computeBuyVerdict(market.best, points, stats);
    const dealScore = computeDealScore({
      currentPrice: market.best,
      points,
      stats,
      competitorPrices: await this.getCompetitorPrices(productId),
      inStock: market.inStock,
      storeCount: market.storeCount,
    });
    const discountCheck = detectMisleadingDiscount(market.best, advertisedWas, points, stats);

    return {
      productId,
      currency: this.currency,
      window,
      market,
      history: stats ? { ...stats, points } : null,
      verdict,
      dealScore,
      discountCheck,
      insufficientData: verdict.verdict === 'INSUFFICIENT_DATA',
    };
  }

  /**
   * One row per day: the cheapest price seen that day and whether anything
   * was in stock. Bounded by the window, so at most ~365 rows come back.
   */
  async getDailySeries(productId: string, days: number): Promise<DailyPricePoint[]> {
    const since = new Date(Date.now() - Math.max(days, 1) * 86_400_000);

    const rows = await this.prisma.$queryRaw<
      Array<{ day: Date; min: Prisma.Decimal; max: Prisma.Decimal; avg: Prisma.Decimal; count: bigint; in_stock: boolean }>
    >`
      SELECT
        date_trunc('day', ph.recorded_at)::date AS day,
        MIN(ph.price_usd)                        AS min,
        MAX(ph.price_usd)                        AS max,
        AVG(ph.price_usd)                        AS avg,
        COUNT(*)                                 AS count,
        BOOL_OR(ph.in_stock)                     AS in_stock
      FROM price_history ph
      WHERE ph.canonical_product_id = ${productId}
        AND ph.recorded_at >= ${since}
        AND ph.price_usd > 0
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return rows.map((row) => ({
      date: row.day.toISOString().slice(0, 10),
      min: Number(row.min),
      max: Number(row.max),
      avg: Number(row.avg),
      count: Number(row.count),
      inStock: row.in_stock,
    }));
  }

  /** Live prices across every store carrying the product. */
  async getCurrentMarket(productId: string): Promise<CurrentMarket> {
    const listings = await this.prisma.sourceListing.findMany({
      where: {
        canonicalProductId: productId,
        priceUsd: { not: null },
        matchStatus: { in: ACCEPTED_MATCHES },
      },
      select: {
        priceUsd: true,
        inStock: true,
        externalUrl: true,
        platformId: true,
        platform: { select: { name: true } },
      },
      orderBy: { priceUsd: 'asc' },
    });

    if (listings.length === 0) {
      return {
        best: null,
        median: null,
        average: null,
        highest: null,
        storeCount: 0,
        inStock: null,
        currency: this.currency,
        bestStore: null,
      };
    }

    const prices = listings.map((listing) => Number(listing.priceUsd)).filter((value) => value > 0);
    const sorted = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    const cheapest = listings[0];

    return {
      best: sorted[0] ?? null,
      median:
        sorted.length === 0
          ? null
          : sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid],
      average: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null,
      highest: sorted[sorted.length - 1] ?? null,
      // Distinct stores, not listings: one store with three variants listed
      // is still one store's worth of market coverage.
      storeCount: new Set(listings.map((listing) => listing.platformId)).size,
      inStock: cheapest.inStock,
      currency: this.currency,
      bestStore: {
        platformId: cheapest.platformId,
        name: cheapest.platform.name,
        url: cheapest.externalUrl,
      },
    };
  }

  private async getCompetitorPrices(productId: string): Promise<number[]> {
    // One price per store — the store's own cheapest — so a store with many
    // listings cannot skew the distribution.
    const rows = await this.prisma.sourceListing.groupBy({
      by: ['platformId'],
      where: {
        canonicalProductId: productId,
        priceUsd: { not: null },
        matchStatus: { in: ACCEPTED_MATCHES },
      },
      _min: { priceUsd: true },
    });

    return rows
      .map((row) => Number(row._min.priceUsd))
      .filter((value) => Number.isFinite(value) && value > 0);
  }

  /**
   * The struck-through "was" price the cheapest listing advertises.
   *
   * Taken from PriceHistory.originalPrice, which ingestion records alongside
   * the live price. Null when no store is claiming a discount at all.
   */
  private async getAdvertisedPreviousPrice(productId: string): Promise<number | null> {
    const recent = await this.prisma.priceHistory.findFirst({
      where: {
        canonicalProductId: productId,
        originalPrice: { not: null },
        // Stale "was" prices are not evidence of a current sale.
        recordedAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
      },
      orderBy: { recordedAt: 'desc' },
      select: { originalPrice: true },
    });

    const value = recent?.originalPrice ? Number(recent.originalPrice) : null;
    return value && value > 0 ? value : null;
  }
}
