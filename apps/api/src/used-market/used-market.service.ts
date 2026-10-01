import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { OPERATIONAL_FLAGS } from '../feature-flags/feature-flags.registry';
import { OfferPolicy, liveOfferWhere } from '../prices/offer-rules';
import { OpenSooqSource } from './opensooq.source';
import { usedQuery, usedRange } from './used-market';

/** Categories where a second-hand market is real and comparable. */
export const USED_MARKET_CATEGORIES = ['smartphones', 'laptops', 'tablets', 'gaming-consoles', 'smart-watches', 'televisions', 'cameras'];

const DAY_MS = 24 * 60 * 60 * 1000;
const REFRESH_AFTER_DAYS = 7;
const SHOW_FOR_DAYS = 30;

@Injectable()
export class UsedMarketService {
  private readonly logger = new Logger(UsedMarketService.name);
  private readonly offerPolicy: OfferPolicy;

  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly source: OpenSooqSource,
    private readonly config: ConfigService,
  ) {
    this.offerPolicy = { maxAgeDays: config.get<number>('pricing.offerMaxAgeDays', 7) };
  }

  /** The latest usable range for a product, or null. Read-only: never scrapes in a request. */
  async latest(productId: string) {
    const snapshot = await this.prisma.usedPriceSnapshot.findFirst({
      where: { canonicalProductId: productId, median: { not: null }, capturedAt: { gte: new Date(Date.now() - SHOW_FOR_DAYS * DAY_MS) } },
      orderBy: { capturedAt: 'desc' },
    });
    if (!snapshot) return null;
    const product = await this.prisma.canonicalProduct.findUnique({ where: { id: productId }, select: { brand: true, model: true } });
    const query = product ? usedQuery(product) : null;
    return {
      source: snapshot.source,
      sampleSize: snapshot.sampleSize,
      p25: Number(snapshot.p25),
      median: Number(snapshot.median),
      p75: Number(snapshot.p75),
      capturedAt: snapshot.capturedAt.toISOString(),
      searchUrl: query ? this.source.searchUrl(query) : null,
    };
  }

  /**
   * The daily sweep: products people watch first, then the most viewed, in
   * the used-market categories, skipping any checked within a week. One
   * request every few seconds; a failure skips the product, never the run.
   */
  async refreshBatch(limit = this.config.get<number>('retailers.usedMarketBatch', 120)): Promise<{ checked: number; ranges: number }> {
    if (!(await this.flags.isEnabled(OPERATIONAL_FLAGS.USED_MARKET))) return { checked: 0, ranges: 0 };
    const since = new Date(Date.now() - REFRESH_AFTER_DAYS * DAY_MS);

    const candidates = await this.prisma.$queryRaw<Array<{ id: string; brand: string | null; model: string | null }>>(Prisma.sql`
      SELECT p."id", p."brand", p."model"
      FROM "canonical_products" p
      JOIN "categories" c ON c."id" = p."category_id"
      WHERE c."slug" IN (${Prisma.join(USED_MARKET_CATEGORIES)})
        AND p."model" IS NOT NULL AND length(p."model") >= 2
        AND NOT EXISTS (
          SELECT 1 FROM "used_price_snapshots" u WHERE u."canonical_product_id" = p."id" AND u."captured_at" >= ${since}
        )
      ORDER BY
        (SELECT count(*) FROM "watchlist_items" w WHERE w."canonical_product_id" = p."id") DESC,
        (SELECT count(*) FROM "page_views" v WHERE v."product_slug" = p."slug" AND v."created_at" >= now() - interval '30 days') DESC,
        p."updated_at" DESC
      LIMIT ${limit}`);

    let ranges = 0;
    for (const product of candidates) {
      const query = usedQuery(product);
      if (!query) continue;
      try {
        const listings = await this.source.search(query);
        const range = usedRange(query, listings, await this.newPrice(product.id));
        await this.prisma.usedPriceSnapshot.create({
          data: {
            canonicalProductId: product.id,
            source: this.source.id,
            sampleSize: range.sampleSize,
            p25: range.p25,
            median: range.median,
            p75: range.p75,
          },
        });
        if (range.median !== null) ranges += 1;
      } catch (error) {
        this.logger.warn(`Used-market search for "${query}" failed: ${(error as Error).message}`);
      }
      await this.pause();
    }
    this.logger.log(`Used market: ${candidates.length} product(s) checked, ${ranges} with a range`);
    return { checked: candidates.length, ranges };
  }

  /** Overridable in tests. */
  pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 3000));

  private async newPrice(productId: string): Promise<number | null> {
    const cheapest = await this.prisma.sourceListing.findFirst({
      where: { canonicalProductId: productId, ...liveOfferWhere(this.offerPolicy) },
      orderBy: { priceUsd: 'asc' },
      select: { priceUsd: true },
    });
    return cheapest?.priceUsd ? Number(cheapest.priceUsd) : null;
  }
}
