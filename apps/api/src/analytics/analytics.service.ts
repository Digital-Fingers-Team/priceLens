import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { PagePath } from './page-path';

/** A view longer than this counts as this long (a tab left open overnight). */
const MAX_VIEW_MS = 30 * 60 * 1000;
/** Duration beacons for older views are ignored. */
const DURATION_WINDOW_MS = 6 * 60 * 60 * 1000;
/** Days are Cairo days: the audience is in Egypt. */
const DAY = Prisma.sql`(("created_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Cairo')::date`;

export interface NewPageView extends PagePath {
  id: string;
  visitorId: string;
  sessionId: string;
  referrerHost: string | null;
  device: 'mobile' | 'desktop';
}

type Row = Record<string, unknown>;

/** bigint and numeric columns come back as bigint/Decimal; the JSON wants numbers. */
function num(value: unknown): number {
  if (value == null) return 0;
  return typeof value === 'number' ? value : Number(value);
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async recordView(view: NewPageView): Promise<void> {
    await this.prisma.pageView.createMany({ data: [view], skipDuplicates: true });
  }

  async recordDuration(id: string, durationMs: number, searchTotal?: number): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "page_views"
      SET "duration_ms" = GREATEST(COALESCE("duration_ms", 0), ${durationMs}),
          "search_total" = CASE WHEN "route" = 'search' THEN COALESCE(${searchTotal ?? null}::int, "search_total") ELSE NULL END
      WHERE "id" = ${id} AND "created_at" > ${new Date(Date.now() - DURATION_WINDOW_MS)}`);
  }

  /** Everything the admin analytics page shows, for the last `days` days (Cairo time). */
  async summary(days: number) {
    const since = await this.cairoDayStart(days);
    const views = Prisma.sql`"page_views" WHERE "created_at" >= ${since}`;
    const capped = Prisma.sql`LEAST(COALESCE("duration_ms", 0), ${MAX_VIEW_MS})`;

    const [
      traffic,
      trafficDaily,
      routes,
      topProducts,
      topCategories,
      searches,
      emptySearches,
      referrers,
      devices,
      products,
      productsDaily,
      users,
      usersDaily,
      favorites,
      alerts,
      storeClicks,
      productClicks,
    ] = await Promise.all([
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT count(*) AS views, count(DISTINCT "visitor_id") AS visitors,
               count(*) FILTER (WHERE "search_query" IS NOT NULL) AS searches, count(DISTINCT "session_id") AS sessions,
               avg(${capped}) FILTER (WHERE "duration_ms" IS NOT NULL) AS avg_ms
        FROM ${views}`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT ${DAY} AS day, count(*) AS views, count(DISTINCT "visitor_id") AS visitors
        FROM ${views} GROUP BY 1 ORDER BY 1`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT "route", count(*) AS views, sum(${capped}) AS total_ms,
               avg(${capped}) FILTER (WHERE "duration_ms" IS NOT NULL) AS avg_ms
        FROM ${views} GROUP BY 1 ORDER BY total_ms DESC`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT v."product_slug" AS slug, p."title", p."title_ar", count(*) AS views,
               count(DISTINCT v."visitor_id") AS visitors, sum(LEAST(COALESCE(v."duration_ms", 0), ${MAX_VIEW_MS})) AS total_ms,
               avg(LEAST(v."duration_ms", ${MAX_VIEW_MS})) AS avg_ms
        FROM "page_views" v LEFT JOIN "canonical_products" p ON p."slug" = v."product_slug"
        WHERE v."created_at" >= ${since} AND v."route" = 'product'
        GROUP BY 1, 2, 3 ORDER BY total_ms DESC, views DESC LIMIT 15`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT v."category_slug" AS slug, c."name", count(*) AS views, sum(LEAST(COALESCE(v."duration_ms", 0), ${MAX_VIEW_MS})) AS total_ms
        FROM "page_views" v LEFT JOIN "categories" c ON c."slug" = v."category_slug"
        WHERE v."created_at" >= ${since} AND v."route" = 'category'
        GROUP BY 1, 2 ORDER BY views DESC LIMIT 10`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT lower("search_query") AS query, count(*) AS searches, count(DISTINCT "visitor_id") AS visitors,
               round(avg("search_total")) AS avg_results
        FROM ${views} AND "search_query" IS NOT NULL
        GROUP BY 1 ORDER BY searches DESC, query LIMIT 20`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT lower("search_query") AS query, count(*) AS searches
        FROM ${views} AND "search_query" IS NOT NULL AND "search_total" = 0
        GROUP BY 1 ORDER BY searches DESC, query LIMIT 10`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT "referrer_host" AS host, count(DISTINCT "session_id") AS sessions
        FROM ${views} AND "referrer_host" IS NOT NULL
        GROUP BY 1 ORDER BY sessions DESC LIMIT 10`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT "device", count(DISTINCT "visitor_id") AS visitors FROM ${views} GROUP BY 1`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT count(*) AS total, count(*) FILTER (WHERE "created_at" >= ${since}) AS new
        FROM "canonical_products"`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT ${DAY} AS day, count(*) AS count FROM "canonical_products"
        WHERE "created_at" >= ${since} GROUP BY 1 ORDER BY 1`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT count(*) AS total, count(*) FILTER (WHERE "created_at" >= ${since}) AS new,
               count(*) FILTER (WHERE "last_login_at" >= ${since}) AS active
        FROM "users" WHERE "deleted_at" IS NULL`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT ${DAY} AS day, count(*) AS count FROM "users"
        WHERE "created_at" >= ${since} AND "deleted_at" IS NULL GROUP BY 1 ORDER BY 1`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT p."slug", p."title", p."title_ar", count(*) AS count,
               count(*) FILTER (WHERE w."created_at" >= ${since}) AS new
        FROM "watchlist_items" w JOIN "canonical_products" p ON p."id" = w."canonical_product_id"
        GROUP BY 1, 2, 3 ORDER BY count DESC, new DESC LIMIT 15`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT p."slug", p."title", p."title_ar", count(*) AS count
        FROM "price_alerts" a JOIN "canonical_products" p ON p."id" = a."canonical_product_id"
        GROUP BY 1, 2, 3 ORDER BY count DESC LIMIT 10`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT pl."name" AS store, count(*) AS clicks
        FROM "affiliate_clicks" c JOIN "platforms" pl ON pl."id" = c."platform_id"
        WHERE c."clicked_at" >= ${since} GROUP BY 1 ORDER BY clicks DESC LIMIT 10`),
      // Which products send people to stores: demand data for the seller and
      // business plans, not just a vanity count.
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT p."slug", p."title", p."title_ar", count(*) AS count
        FROM "affiliate_clicks" c JOIN "canonical_products" p ON p."id" = c."canonical_product_id"
        WHERE c."clicked_at" >= ${since} GROUP BY 1, 2, 3 ORDER BY count DESC LIMIT 10`),
    ]);

    const t = traffic[0] ?? {};
    const watchTotal = await this.prisma.watchlistItem.count();
    const alertTotal = await this.prisma.priceAlert.count();
    const clickTotal = storeClicks.reduce((sum, r) => sum + num(r.clicks), 0);

    return {
      days,
      since: since.toISOString(),
      traffic: {
        views: num(t.views),
        visitors: num(t.visitors),
        sessions: num(t.sessions),
        searches: num(t.searches),
        avgViewMs: Math.round(num(t.avg_ms)),
        daily: trafficDaily.map((r) => ({ day: dayString(r.day), views: num(r.views), visitors: num(r.visitors) })),
        devices: devices.map((r) => ({ device: String(r.device), visitors: num(r.visitors) })),
        referrers: referrers.map((r) => ({ host: String(r.host), sessions: num(r.sessions) })),
      },
      engagement: {
        routes: routes.map((r) => ({
          route: String(r.route),
          views: num(r.views),
          totalMs: num(r.total_ms),
          avgViewMs: Math.round(num(r.avg_ms)),
        })),
        products: topProducts.map((r) => ({
          slug: String(r.slug),
          title: (r.title as string | null) ?? String(r.slug),
          titleAr: (r.title_ar as string | null) ?? null,
          views: num(r.views),
          visitors: num(r.visitors),
          totalMs: num(r.total_ms),
          avgViewMs: Math.round(num(r.avg_ms)),
        })),
        categories: topCategories.map((r) => ({
          slug: String(r.slug),
          name: (r.name as string | null) ?? String(r.slug),
          views: num(r.views),
          totalMs: num(r.total_ms),
        })),
      },
      searches: {
        top: searches.map((r) => ({
          query: String(r.query),
          searches: num(r.searches),
          visitors: num(r.visitors),
          avgResults: r.avg_results == null ? null : num(r.avg_results),
        })),
        noResults: emptySearches.map((r) => ({ query: String(r.query), searches: num(r.searches) })),
      },
      products: {
        total: num(products[0]?.total),
        discovered: num(products[0]?.new),
        daily: productsDaily.map((r) => ({ day: dayString(r.day), count: num(r.count) })),
      },
      accounts: {
        total: num(users[0]?.total),
        new: num(users[0]?.new),
        active: num(users[0]?.active),
        daily: usersDaily.map((r) => ({ day: dayString(r.day), count: num(r.count) })),
      },
      favorites: {
        total: watchTotal,
        alerts: alertTotal,
        products: favorites.map((r) => ({
          slug: String(r.slug),
          title: String(r.title),
          titleAr: (r.title_ar as string | null) ?? null,
          count: num(r.count),
          new: num(r.new),
        })),
        alertProducts: alerts.map((r) => ({
          slug: String(r.slug),
          title: String(r.title),
          titleAr: (r.title_ar as string | null) ?? null,
          count: num(r.count),
        })),
      },
      storeClicks: {
        total: clickTotal,
        stores: storeClicks.map((r) => ({ store: String(r.store), clicks: num(r.clicks) })),
        products: productClicks.map((r) => ({
          slug: String(r.slug),
          title: String(r.title),
          titleAr: (r.title_ar as string | null) ?? null,
          count: num(r.count),
        })),
      },
    };
  }

  /** Midnight in Cairo `days - 1` days ago, as a UTC timestamp (the columns hold UTC). */
  private async cairoDayStart(days: number): Promise<Date> {
    const [row] = await this.prisma.$queryRaw<Array<{ since: Date }>>(Prisma.sql`
      SELECT ((date_trunc('day', now() AT TIME ZONE 'Africa/Cairo') - make_interval(days => ${days - 1}::int))
              AT TIME ZONE 'Africa/Cairo') AT TIME ZONE 'UTC' AS since`);
    return row.since;
  }
}

function dayString(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
