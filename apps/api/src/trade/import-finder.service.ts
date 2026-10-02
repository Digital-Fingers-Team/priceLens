import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LandedCostRule, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { computeLandedCost } from '../intelligence/landed-cost';
import { pickRule, ruleValues } from '../intelligence/landed-cost.service';
import { OfferPolicy, liveOfferSql, liveOfferWhere, liveOffers } from '../prices/offer-rules';
import { SUSPICIOUS_MARGIN_PCT, demandScore, median, opportunityMargin, opportunityScore, volatilityPct } from './trade-math';

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 200;

/** What one product costs brought in from abroad, against what it sells for here. */
export interface ProductQuote {
  productId: string;
  categoryId: string;
  /** The cross-border offer with the lowest landed cost. */
  import: { listingId: string; platformId: string; store: string; price: number; landedCost: number; rule: LandedCostRule };
  /** Cheapest live offer per local store, ascending. */
  local: Array<{ platformId: string; store: string; price: number; reviewCount: number | null }>;
}

export interface OpportunityQuery {
  categoryId?: string;
  minMarginPct?: number;
  limit?: number;
  offset?: number;
}

/**
 * Import-opportunity finder: products whose landed cost from a cross-border
 * store (AliExpress, Alibaba... any store with a landed-cost rule) is well
 * below the Egyptian market price, ranked by margin damped by demand.
 *
 * A store is "cross-border" exactly when the admin gave it a landed-cost
 * rule, the same test the product page uses. Everything is computed from
 * prices we already hold; nothing is scraped here.
 */
@Injectable()
export class ImportFinderService {
  private readonly logger = new Logger(ImportFinderService.name);
  private readonly offerPolicy: OfferPolicy;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.offerPolicy = { maxAgeDays: config.get<number>('pricing.offerMaxAgeDays', 7) };
  }

  /** Landed cost of the best cross-border offer and the local offers, per product. Products lacking either are left out. */
  async quote(productIds: string[]): Promise<Map<string, ProductQuote>> {
    const result = new Map<string, ProductQuote>();
    if (productIds.length === 0) return result;
    const rules = await this.prisma.landedCostRule.findMany({ where: { isActive: true } });
    if (rules.length === 0) return result;
    const crossBorder = new Set(rules.map((rule) => rule.platformId));

    for (let i = 0; i < productIds.length; i += BATCH) {
      const ids = productIds.slice(i, i + BATCH);
      const listings = await this.prisma.sourceListing.findMany({
        where: { canonicalProductId: { in: ids }, ...liveOfferWhere(this.offerPolicy) },
        select: {
          id: true,
          canonicalProductId: true,
          priceUsd: true,
          inStock: true,
          platformId: true,
          rawTitle: true,
          lastSeenAt: true,
          matchStatus: true,
          reviewCount: true,
          platform: { select: { name: true } },
          canonicalProduct: { select: { categoryId: true } },
        },
        orderBy: [{ priceUsd: 'asc' }, { id: 'asc' }],
      });
      const byProduct = new Map<string, typeof listings>();
      for (const listing of listings) {
        const key = listing.canonicalProductId!;
        byProduct.set(key, [...(byProduct.get(key) ?? []), listing]);
      }

      for (const [productId, offers] of byProduct) {
        const categoryId = offers[0].canonicalProduct!.categoryId;
        let best: ProductQuote['import'] | null = null;
        const local = new Map<string, ProductQuote['local'][number]>();
        for (const offer of liveOffers(offers, this.offerPolicy)) {
          const price = Number(offer.priceUsd);
          if (!(price > 0)) continue;
          if (crossBorder.has(offer.platformId)) {
            const rule = pickRule(rules, offer.platformId, categoryId);
            if (!rule) continue;
            const landedCost = computeLandedCost(price, ruleValues(rule)).total;
            if (!best || landedCost < best.landedCost) {
              best = { listingId: offer.id, platformId: offer.platformId, store: offer.platform.name, price, landedCost, rule };
            }
          } else if (!local.has(offer.platformId)) {
            // Offers come cheapest first, so the first one per store is its lowest.
            local.set(offer.platformId, { platformId: offer.platformId, store: offer.platform.name, price, reviewCount: offer.reviewCount });
          }
        }
        if (best && local.size > 0) {
          result.set(productId, { productId, categoryId, import: best, local: [...local.values()].sort((a, b) => a.price - b.price) });
        }
      }
    }
    return result;
  }

  /** Landed cost of an EGP price under a rule, for FX scenarios. */
  landedAt(rule: LandedCostRule) {
    const values = ruleValues(rule);
    return (price: number) => computeLandedCost(price, values).total;
  }

  /** Nightly: recompute every opportunity from current prices and replace the table. */
  async rebuild(): Promise<{ candidates: number; opportunities: number }> {
    const rules = await this.prisma.landedCostRule.findMany({ where: { isActive: true }, select: { platformId: true } });
    const crossBorder = [...new Set(rules.map((rule) => rule.platformId))];
    if (crossBorder.length === 0) {
      await this.prisma.importOpportunity.deleteMany({});
      return { candidates: 0, opportunities: 0 };
    }

    // Products with a live offer on both sides of the border.
    const candidates = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT l.canonical_product_id AS id
      FROM source_listings l
      WHERE l.canonical_product_id IS NOT NULL AND ${liveOfferSql('l', this.offerPolicy)}
      GROUP BY l.canonical_product_id
      HAVING bool_or(l.platform_id IN (${Prisma.join(crossBorder)}))
         AND bool_or(l.platform_id NOT IN (${Prisma.join(crossBorder)}))`;
    const ids = candidates.map((row) => row.id);
    const quotes = await this.quote(ids);

    const since = new Date(Date.now() - 30 * DAY_MS);
    const [interest, daily] = await Promise.all([this.interest(ids, since), this.localDailyLows(ids, crossBorder, since)]);

    const rows: Prisma.ImportOpportunityCreateManyInput[] = [];
    for (const quote of quotes.values()) {
      const localMedian = median(quote.local.map((offer) => offer.price))!;
      const { marginEgp, marginPct } = opportunityMargin({ landedCost: quote.import.landedCost, localMedian });
      if (marginPct < 10) continue; // too thin to cover the trader's own costs
      const reviews = quote.local.reduce<number | null>((sum, offer) => (offer.reviewCount == null ? sum : (sum ?? 0) + offer.reviewCount), null);
      const volatility = volatilityPct(daily.get(quote.productId) ?? []);
      const views = interest.get(quote.productId) ?? 0;
      const demand = demandScore({ localStores: quote.local.length, interest: views, reviewCount: reviews, volatilityPct: volatility });
      rows.push({
        canonicalProductId: quote.productId,
        categoryId: quote.categoryId,
        sourceListingId: quote.import.listingId,
        platformId: quote.import.platformId,
        importPrice: decimal(quote.import.price),
        landedCost: decimal(quote.import.landedCost),
        localLowest: decimal(quote.local[0].price),
        localMedian: decimal(localMedian),
        localStores: quote.local.length,
        marginEgp: decimal(marginEgp),
        marginPct,
        volatilityPct: volatility,
        interest: views,
        reviewCount: reviews,
        demandScore: demand,
        score: opportunityScore(marginPct, demand),
      });
    }

    await this.prisma.$transaction([this.prisma.importOpportunity.deleteMany({}), this.prisma.importOpportunity.createMany({ data: rows })]);
    this.logger.log(`Import finder: ${rows.length} opportunities from ${ids.length} candidate products`);
    return { candidates: ids.length, opportunities: rows.length };
  }

  async list(query: OpportunityQuery) {
    const where: Prisma.ImportOpportunityWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.minMarginPct != null ? { marginPct: { gte: query.minMarginPct } } : {}),
    };
    const take = Math.min(100, Math.max(1, query.limit ?? 50));
    const [total, rows, computed, categories] = await Promise.all([
      this.prisma.importOpportunity.count({ where }),
      this.prisma.importOpportunity.findMany({
        where,
        orderBy: [{ score: 'desc' }, { id: 'asc' }],
        take,
        skip: Math.max(0, query.offset ?? 0),
        include: {
          canonicalProduct: { select: { id: true, slug: true, title: true, titleAr: true, imageUrl: true, thumbnailUrl: true } },
          category: { select: { id: true, slug: true, name: true } },
          platform: { select: { slug: true, name: true } },
        },
      }),
      this.prisma.importOpportunity.aggregate({ _max: { computedAt: true } }),
      this.prisma.importOpportunity.groupBy({ by: ['categoryId'], _count: { _all: true } }),
    ]);
    const categoryNames = await this.prisma.category.findMany({
      where: { id: { in: categories.map((c) => c.categoryId) } },
      select: { id: true, slug: true, name: true },
    });
    const counts = new Map(categories.map((c) => [c.categoryId, c._count._all]));

    return {
      currency: 'EGP',
      total,
      computedAt: computed._max.computedAt?.toISOString() ?? null,
      categories: categoryNames
        .map((category) => ({ ...category, count: counts.get(category.id) ?? 0 }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      items: rows.map((row) => ({
        product: row.canonicalProduct,
        category: row.category,
        importStore: row.platform,
        importPrice: Number(row.importPrice),
        landedCost: Number(row.landedCost),
        localLowest: Number(row.localLowest),
        localMedian: Number(row.localMedian),
        localStores: row.localStores,
        marginEgp: Number(row.marginEgp),
        marginPct: row.marginPct,
        volatilityPct: row.volatilityPct,
        interest: row.interest,
        demandScore: row.demandScore,
        score: row.score,
        /** A gap this wide is as often a different product as a real one. */
        checkMatch: row.marginPct >= SUSPICIOUS_MARGIN_PCT,
      })),
    };
  }

  /** Views, clicks, watchlist adds and alerts per product since `since`. */
  private async interest(ids: string[], since: Date): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<Array<{ id: string; n: bigint }>>`
      SELECT id, sum(n)::bigint AS n FROM (
        SELECT p.id, count(*) AS n FROM page_views v JOIN canonical_products p ON p.slug = v.product_slug
          WHERE v.created_at >= ${since} AND p.id IN (${Prisma.join(ids)}) GROUP BY p.id
        UNION ALL
        SELECT canonical_product_id, count(*) FROM affiliate_clicks
          WHERE clicked_at >= ${since} AND canonical_product_id IN (${Prisma.join(ids)}) GROUP BY 1
        UNION ALL
        SELECT canonical_product_id, count(*) FROM watchlist_items
          WHERE created_at >= ${since} AND canonical_product_id IN (${Prisma.join(ids)}) GROUP BY 1
        UNION ALL
        SELECT canonical_product_id, count(*) FROM price_alerts
          WHERE created_at >= ${since} AND canonical_product_id IN (${Prisma.join(ids)}) GROUP BY 1
      ) t GROUP BY id`;
    return new Map(rows.map((row) => [row.id, Number(row.n)]));
  }

  /** The local market's lowest price per day, per product, from price_daily. */
  private async localDailyLows(ids: string[], crossBorder: string[], since: Date): Promise<Map<string, number[]>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<Array<{ id: string; lows: Prisma.Decimal[] }>>`
      SELECT id, array_agg(low ORDER BY day) AS lows FROM (
        SELECT l.canonical_product_id AS id, d.day, min(d.min_price) AS low
        FROM price_daily d JOIN source_listings l ON l.id = d.source_listing_id
        WHERE d.day >= ${since}::date AND l.canonical_product_id IN (${Prisma.join(ids)})
          AND l.platform_id NOT IN (${Prisma.join(crossBorder)})
        GROUP BY 1, 2
      ) t GROUP BY id`;
    return new Map(rows.map((row) => [row.id, row.lows.map(Number)]));
  }
}

const decimal = (value: number) => new Prisma.Decimal(value.toFixed(2));
