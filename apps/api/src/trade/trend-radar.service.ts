import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TrendScope } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { addDays, growthPct, median, trendScore, weekStartOf, zonedDay } from './trade-math';

const TIME_ZONE = 'Africa/Cairo';
const TOP_CATEGORIES = 20;
const TOP_PRODUCTS = 40;
/** A week-over-week price move below this is noise, not a trend. */
const PRICE_MOVE_PCT = 5;
/** Products priced in both weeks before a category gets a median price change. */
const MIN_PRICED = 3;

/** Midnight of a Cairo day, as the UTC timestamp the columns hold. */
const cairoMidnight = (day: string) => Prisma.sql`((${day}::date)::timestamp AT TIME ZONE ${TIME_ZONE}) AT TIME ZONE 'UTC'`;

interface ProductRow {
  pid: string;
  category_id: string;
  now_low: Prisma.Decimal | null;
  before_low: Prisma.Decimal | null;
  stores_now: number;
  stores_before: number;
}

/**
 * The weekly trend radar: categories and products with rising demand
 * signals (new listings, more stores, more interest) and price moves,
 * comparing a finished Saturday-to-Friday week with the one before.
 *
 * price_daily has a row only on days a listing's price changed, so a
 * listing's price at the end of a week is its last close up to then.
 */
@Injectable()
export class TrendRadarService {
  private readonly logger = new Logger(TrendRadarService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The last finished week (Saturday start), Cairo time. */
  lastFullWeek(now = new Date()): string {
    return addDays(weekStartOf(zonedDay(now, TIME_ZONE)), -7);
  }

  async build(weekStart = this.lastFullWeek()): Promise<{ weekStart: string; categories: number; products: number }> {
    const week = weekStartOf(weekStart);
    const weekEnd = addDays(week, 7);
    const before = addDays(week, -7);

    const products = await this.prisma.$queryRaw<ProductRow[]>`
      WITH live AS (
        SELECT l.id, l.platform_id, l.canonical_product_id AS pid, l.first_seen_at, l.last_seen_at
        FROM source_listings l
        WHERE l.canonical_product_id IS NOT NULL
          AND l.match_status IN ('ACCEPTED', 'MANUAL_ACCEPT')
          AND l.last_seen_at >= ${cairoMidnight(before)}
      ), priced AS (
        SELECT live.*,
          (SELECT d.close_price FROM price_daily d WHERE d.source_listing_id = live.id AND d.day < ${weekEnd}::date ORDER BY d.day DESC LIMIT 1) AS now_p,
          (SELECT d.close_price FROM price_daily d WHERE d.source_listing_id = live.id AND d.day < ${week}::date ORDER BY d.day DESC LIMIT 1) AS before_p
        FROM live
      )
      SELECT p.pid, c.category_id,
        min(p.now_p) FILTER (WHERE p.before_p IS NOT NULL) AS now_low,
        min(p.before_p) FILTER (WHERE p.now_p IS NOT NULL) AS before_low,
        count(DISTINCT p.platform_id) FILTER (WHERE p.first_seen_at < ${cairoMidnight(weekEnd)})::int AS stores_now,
        count(DISTINCT p.platform_id) FILTER (WHERE p.first_seen_at < ${cairoMidnight(week)})::int AS stores_before
      FROM priced p JOIN canonical_products c ON c.id = p.pid
      GROUP BY p.pid, c.category_id`;

    const [newListings, interest, categoryViews] = await Promise.all([
      this.prisma.$queryRaw<Array<{ category_id: string; now: number; before: number }>>`
        SELECT c.category_id,
          count(*) FILTER (WHERE l.first_seen_at >= ${cairoMidnight(week)})::int AS now,
          count(*) FILTER (WHERE l.first_seen_at < ${cairoMidnight(week)})::int AS before
        FROM source_listings l JOIN canonical_products c ON c.id = l.canonical_product_id
        WHERE l.first_seen_at >= ${cairoMidnight(before)} AND l.first_seen_at < ${cairoMidnight(weekEnd)}
        GROUP BY 1`,
      this.productInterest(before, week, weekEnd),
      this.prisma.$queryRaw<Array<{ category_id: string; now: number; before: number }>>`
        SELECT c.id AS category_id,
          count(*) FILTER (WHERE v.created_at >= ${cairoMidnight(week)})::int AS now,
          count(*) FILTER (WHERE v.created_at < ${cairoMidnight(week)})::int AS before
        FROM page_views v JOIN categories c ON c.slug = v.category_slug
        WHERE v.created_at >= ${cairoMidnight(before)} AND v.created_at < ${cairoMidnight(weekEnd)}
        GROUP BY 1`,
    ]);

    // ── Categories ──
    type Acc = { changes: number[]; drops: number; rises: number; priced: number; interest: number; interestBefore: number; supply: number; supplyBefore: number };
    const categories = new Map<string, Acc>();
    const acc = (id: string) => {
      let entry = categories.get(id);
      if (!entry) {
        entry = { changes: [], drops: 0, rises: 0, priced: 0, interest: 0, interestBefore: 0, supply: 0, supplyBefore: 0 };
        categories.set(id, entry);
      }
      return entry;
    };

    const productSignals: Prisma.TrendSignalCreateManyInput[] = [];
    for (const row of products) {
      const entry = acc(row.category_id);
      const seen = interest.get(row.pid) ?? { now: 0, before: 0 };
      entry.interest += seen.now;
      entry.interestBefore += seen.before;

      const nowLow = row.now_low == null ? null : Number(row.now_low);
      const beforeLow = row.before_low == null ? null : Number(row.before_low);
      const change = nowLow && beforeLow ? Math.round(((nowLow - beforeLow) / beforeLow) * 10_000) / 100 : null;
      if (change != null) {
        entry.changes.push(change);
        entry.priced += 1;
        if (change <= -3) entry.drops += 1;
        if (change >= 3) entry.rises += 1;
      }

      const moved = change != null && Math.abs(change) >= PRICE_MOVE_PCT;
      const newStores = row.stores_now > row.stores_before && row.stores_before > 0;
      if (!moved && !newStores && seen.now < 3) continue;
      productSignals.push({
        weekStart: new Date(`${week}T00:00:00Z`),
        scope: TrendScope.PRODUCT,
        canonicalProductId: row.pid,
        categoryId: row.category_id,
        priceChangePct: change,
        supply: row.stores_now,
        supplyBefore: row.stores_before,
        interest: seen.now,
        interestBefore: seen.before,
        metrics: { lowNow: nowLow, lowBefore: beforeLow },
        score: trendScore({
          supplyGrowthPct: growthPct(row.stores_now, row.stores_before, 1),
          interestGrowthPct: growthPct(seen.now, seen.before, 3),
          priceChangePct: change,
        }),
      });
    }
    for (const row of newListings) {
      const entry = acc(row.category_id);
      entry.supply = row.now;
      entry.supplyBefore = row.before;
    }
    for (const row of categoryViews) {
      const entry = acc(row.category_id);
      entry.interest += row.now;
      entry.interestBefore += row.before;
    }

    const categorySignals: Prisma.TrendSignalCreateManyInput[] = [...categories.entries()]
      .filter(([, entry]) => entry.supply + entry.supplyBefore + entry.interest + entry.interestBefore + entry.priced > 0)
      .map(([categoryId, entry]) => {
        // One or two products moving is not a category trend.
        const change = entry.changes.length >= MIN_PRICED ? median(entry.changes) : null;
        const priceChangePct = change == null ? null : Math.round(change * 100) / 100;
        return {
          weekStart: new Date(`${week}T00:00:00Z`),
          scope: TrendScope.CATEGORY,
          categoryId,
          priceChangePct,
          supply: entry.supply,
          supplyBefore: entry.supplyBefore,
          interest: entry.interest,
          interestBefore: entry.interestBefore,
          metrics: { priced: entry.priced, drops: entry.drops, rises: entry.rises },
          score: trendScore({
            supplyGrowthPct: growthPct(entry.supply, entry.supplyBefore),
            interestGrowthPct: growthPct(entry.interest, entry.interestBefore),
            priceChangePct,
          }),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_CATEGORIES);

    const topProducts = productSignals.sort((a, b) => b.score - a.score).slice(0, TOP_PRODUCTS);
    await this.prisma.$transaction([
      this.prisma.trendSignal.deleteMany({ where: { weekStart: new Date(`${week}T00:00:00Z`) } }),
      this.prisma.trendSignal.createMany({ data: [...categorySignals, ...topProducts] }),
    ]);
    this.logger.log(`Trend radar ${week}: ${categorySignals.length} categories, ${topProducts.length} products`);
    return { weekStart: week, categories: categorySignals.length, products: topProducts.length };
  }

  /** Weeks with a radar, newest first, and the signals of one of them (default: the newest). */
  async get(weekStart?: string) {
    const weeks = await this.prisma.trendSignal.groupBy({ by: ['weekStart'], orderBy: { weekStart: 'desc' }, take: 12 });
    const available = weeks.map((row) => row.weekStart.toISOString().slice(0, 10));
    const week = weekStart && available.includes(weekStartOf(weekStart)) ? weekStartOf(weekStart) : available[0];
    if (!week) return { weekStart: null, weeks: [], categories: [], products: [] };

    const signals = await this.prisma.trendSignal.findMany({
      where: { weekStart: new Date(`${week}T00:00:00Z`) },
      orderBy: [{ score: 'desc' }, { id: 'asc' }],
      include: {
        category: { select: { id: true, slug: true, name: true } },
        canonicalProduct: { select: { id: true, slug: true, title: true, titleAr: true, thumbnailUrl: true, imageUrl: true } },
      },
    });
    const view = (signal: (typeof signals)[number]) => ({
      category: signal.category,
      priceChangePct: signal.priceChangePct,
      supply: signal.supply,
      supplyBefore: signal.supplyBefore,
      interest: signal.interest,
      interestBefore: signal.interestBefore,
      metrics: signal.metrics as Record<string, number | null>,
      score: signal.score,
    });
    return {
      weekStart: week,
      weekEnd: addDays(week, 6),
      weeks: available,
      categories: signals.filter((s) => s.scope === TrendScope.CATEGORY).map(view),
      products: signals.filter((s) => s.scope === TrendScope.PRODUCT).map((s) => ({ ...view(s), product: s.canonicalProduct })),
    };
  }

  /** Views, clicks, watchlist adds and alerts per product, this week and the week before. */
  private async productInterest(before: string, week: string, weekEnd: string) {
    const rows = await this.prisma.$queryRaw<Array<{ pid: string; now: number; before: number }>>`
      SELECT pid, sum(now)::int AS now, sum(before)::int AS before FROM (
        SELECT p.id AS pid,
          count(*) FILTER (WHERE v.created_at >= ${cairoMidnight(week)}) AS now,
          count(*) FILTER (WHERE v.created_at < ${cairoMidnight(week)}) AS before
        FROM page_views v JOIN canonical_products p ON p.slug = v.product_slug
        WHERE v.created_at >= ${cairoMidnight(before)} AND v.created_at < ${cairoMidnight(weekEnd)}
        GROUP BY 1
        UNION ALL
        SELECT canonical_product_id,
          count(*) FILTER (WHERE clicked_at >= ${cairoMidnight(week)}),
          count(*) FILTER (WHERE clicked_at < ${cairoMidnight(week)})
        FROM affiliate_clicks
        WHERE canonical_product_id IS NOT NULL AND clicked_at >= ${cairoMidnight(before)} AND clicked_at < ${cairoMidnight(weekEnd)}
        GROUP BY 1
        UNION ALL
        SELECT canonical_product_id,
          count(*) FILTER (WHERE created_at >= ${cairoMidnight(week)}),
          count(*) FILTER (WHERE created_at < ${cairoMidnight(week)})
        FROM watchlist_items
        WHERE created_at >= ${cairoMidnight(before)} AND created_at < ${cairoMidnight(weekEnd)}
        GROUP BY 1
        UNION ALL
        SELECT canonical_product_id,
          count(*) FILTER (WHERE created_at >= ${cairoMidnight(week)}),
          count(*) FILTER (WHERE created_at < ${cairoMidnight(week)})
        FROM price_alerts
        WHERE created_at >= ${cairoMidnight(before)} AND created_at < ${cairoMidnight(weekEnd)}
        GROUP BY 1
      ) t GROUP BY pid`;
    return new Map(rows.map((row) => [row.pid, { now: row.now, before: row.before }]));
  }
}
