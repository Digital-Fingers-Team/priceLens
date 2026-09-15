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
  PriceChangePoint,
  computeBuyVerdict,
  computeHistoryStats,
  detectMisleadingDiscount,
  forwardFillDailySeries,
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
   * The product's daily price series over the window.
   *
   * PriceHistory is *change-only* — a row is written only when a listing's
   * price actually moves — so the stored rows are not a daily sample and
   * cannot be grouped by day directly: a price that held steady for two
   * months would read as a single day of history. The rows are change events;
   * forwardFillDailySeries turns them into the daily series the statistics
   * actually need.
   *
   * The query deliberately reaches one row further back than the window per
   * listing, so a listing whose last change predates the window still has a
   * known price on the window's first day instead of appearing mid-series.
   */
  async getDailySeries(productId: string, days: number): Promise<DailyPricePoint[]> {
    const windowDays = Math.max(days, 1);
    const since = new Date(Date.now() - windowDays * 86_400_000);

    const rows = await this.prisma.$queryRaw<
      Array<{
        source_listing_id: string;
        day: Date;
        price: Prisma.Decimal;
        in_stock: boolean;
        last_seen_at: Date;
      }>
    >`
      WITH listings AS (
        SELECT DISTINCT source_listing_id
        FROM price_history
        WHERE canonical_product_id = ${productId}::text
      ),
      -- How recently each listing was actually observed. A listing that has
      -- stopped being scraped must stop contributing to the daily price, or
      -- its final price would be carried forward as if still on sale.
      seen AS (
        SELECT sl.id AS source_listing_id, sl.last_seen_at
        FROM source_listings sl
        JOIN listings l ON l.source_listing_id = sl.id
      ),
      -- The last price each listing was known to have *before* the window,
      -- so day one of the chart is not artificially empty.
      carried AS (
        SELECT ph.source_listing_id, ph.recorded_at, ph.price_usd, ph.in_stock
        FROM listings l
        CROSS JOIN LATERAL (
          SELECT ph.source_listing_id, ph.recorded_at, ph.price_usd, ph.in_stock
          FROM price_history ph
          WHERE ph.source_listing_id = l.source_listing_id
            AND ph.recorded_at < ${since}
            AND ph.price_usd > 0
          ORDER BY ph.recorded_at DESC
          LIMIT 1
        ) ph
      ),
      within AS (
        SELECT ph.source_listing_id, ph.recorded_at, ph.price_usd, ph.in_stock
        FROM price_history ph
        WHERE ph.canonical_product_id = ${productId}::text
          AND ph.recorded_at >= ${since}
          AND ph.price_usd > 0
      )
      SELECT c.source_listing_id,
             date_trunc('day', c.recorded_at)::date AS day,
             c.price_usd                            AS price,
             c.in_stock,
             s.last_seen_at
      FROM (SELECT * FROM carried UNION ALL SELECT * FROM within) c
      JOIN seen s ON s.source_listing_id = c.source_listing_id
      ORDER BY c.recorded_at ASC
    `;

    if (rows.length === 0) return [];

    const changes: PriceChangePoint[] = rows.map((row) => ({
      sourceListingId: row.source_listing_id,
      date: row.day.toISOString().slice(0, 10),
      price: Number(row.price),
      inStock: row.in_stock,
    }));

    const lastSeenByListing = new Map<string, string>();
    for (const row of rows) {
      lastSeenByListing.set(row.source_listing_id, row.last_seen_at.toISOString().slice(0, 10));
    }

    // Never start the series before the window, even if a carried-forward row
    // is older; and never project past today.
    const windowStart = since.toISOString().slice(0, 10);
    const firstObserved = changes[0].date;
    const from = firstObserved > windowStart ? firstObserved : windowStart;

    return forwardFillDailySeries(changes, {
      from,
      to: new Date().toISOString().slice(0, 10),
      lastSeenByListing,
    });
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
   * The struck-through "was" price a store is currently advertising.
   *
   * IMPORTANT: this is *not* PriceHistory.originalPrice. Despite the name,
   * that column holds the store's raw, pre-FX-conversion price (see
   * LiveIngestionService.appendPriceHistory) — for an EGP store it equals the
   * live price, and for a foreign-currency store it is the same price in a
   * different currency. Reading it as a recommended retail price would either
   * find a discount that was never claimed or compare two currencies as if
   * they were one.
   *
   * The real advertised price comes from SourceListing.advertisedPrice, which
   * connectors populate only where the store actually publishes one. Null —
   * meaning "no discount is being claimed" — is the correct and common answer,
   * and is strictly better than a fabricated one.
   */
  private async getAdvertisedPreviousPrice(productId: string): Promise<number | null> {
    const listing = await this.prisma.sourceListing.findFirst({
      where: {
        canonicalProductId: productId,
        advertisedPrice: { not: null },
        priceUsd: { not: null },
        matchStatus: { in: ACCEPTED_MATCHES },
        // A stale "was" price is not evidence of a current sale.
        lastSeenAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
      },
      orderBy: { priceUsd: 'asc' },
      select: { advertisedPrice: true },
    });

    const value = listing?.advertisedPrice ? Number(listing.advertisedPrice) : null;
    return value && value > 0 ? value : null;
  }
}
