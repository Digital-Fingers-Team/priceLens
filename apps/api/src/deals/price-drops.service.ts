import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { RedisCacheService } from '../common/cache/redis-cache.service';
import { PrismaService } from '../database/prisma.service';

/**
 * Real price drops: a store's live price against the same listing's median
 * daily close over the last 30 days (the last 2 days left out, so a drop is
 * measured against its own past and not against itself).
 *
 * Per listing, not per product: a product's best price moves whenever a
 * listing appears or disappears, which is not a drop anyone can buy. AliExpress
 * and Alibaba are left out: their "price" is the cheapest variant option and
 * jumps between options (measured 2026-10-10: their "drops" were straps and
 * phone covers swapping variants). A drop above 60% is far more often a
 * mismatched listing than a sale, so it is not shown.
 */
const CACHE_KEY = 'deals:price-drops:v1';
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_ROWS = 120;
const MIN_DROP = 0.05;
const MAX_DROP = 0.6;
const MIN_HISTORY_DAYS = 5;
const MIN_SAVING_EGP = 20;
const FRESH_HOURS = 72;
const EXCLUDED_STORES = ['aliexpress', 'alibaba'];

export interface PriceDrop {
  productId: string;
  slug: string;
  title: string;
  titleAr: string | null;
  brand: string | null;
  imageUrl: string | null;
  categorySlug: string;
  listingId: string;
  store: string;
  storeSlug: string;
  price: number;
  usualPrice: number;
  dropPct: number;
  historyDays: number;
  storeCount: number;
}

export interface PriceDropsPage {
  generatedAt: string;
  drops: PriceDrop[];
  /** The public deals channel (t.me link), when DEALS_TELEGRAM_CHAT is an @name. */
  telegramUrl?: string | null;
}

/** "@pricelens_deals" → "https://t.me/pricelens_deals"; a numeric (private) id has no public link. */
export function channelUrl(chat: string): string | null {
  const name = chat.trim().match(/^@([A-Za-z0-9_]{5,32})$/)?.[1];
  return name ? `https://t.me/${name}` : null;
}

type Row = Record<string, unknown>;

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

@Injectable()
export class PriceDropsService {
  private readonly logger = new Logger(PriceDropsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly config: ConfigService,
  ) {}

  async list(options: { limit?: number; category?: string } = {}): Promise<PriceDropsPage> {
    const all = await this.all();
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? 60) || 60, 1), MAX_ROWS);
    const drops = options.category ? all.drops.filter((d) => d.categorySlug === options.category) : all.drops;
    const telegramUrl = channelUrl(this.config.get<string>('notifications.dealsTelegramChat', ''));
    return { generatedAt: all.generatedAt, drops: drops.slice(0, limit), telegramUrl };
  }

  /** Every drop, biggest first; one hour in Redis (the query takes a few seconds). */
  async all(): Promise<PriceDropsPage> {
    try {
      const cached = await this.cache.get<PriceDropsPage>(CACHE_KEY);
      if (cached) return cached;
    } catch (error) {
      this.logger.warn(`Price-drop cache read failed: ${(error as Error).message}`);
    }

    const page: PriceDropsPage = { generatedAt: new Date().toISOString(), drops: await this.query() };
    try {
      await this.cache.set(CACHE_KEY, page, CACHE_TTL_MS);
    } catch (error) {
      this.logger.warn(`Price-drop cache write failed: ${(error as Error).message}`);
    }
    return page;
  }

  private async query(): Promise<PriceDrop[]> {
    const rows = await this.prisma.$queryRaw<Row[]>(Prisma.sql`
      WITH cur AS (
        SELECT l."id" AS lid, l."canonical_product_id" AS pid, l."price_usd" AS price, l."platform_id"
        FROM "source_listings" l JOIN "platforms" pl ON pl."id" = l."platform_id"
        WHERE l."canonical_product_id" IS NOT NULL
          AND l."match_status" IN ('ACCEPTED', 'MANUAL_ACCEPT')
          AND l."price_usd" > 0 AND l."in_stock" IS DISTINCT FROM false
          AND l."last_seen_at" > now() - make_interval(hours => ${FRESH_HOURS}::int)
          AND pl."slug" <> ALL(${EXCLUDED_STORES}::text[])
      ), ref AS (
        SELECT d."source_listing_id" AS lid,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY d."close_price") AS med, count(*) AS days
        FROM "price_daily" d JOIN cur c ON c.lid = d."source_listing_id"
        WHERE d."day" >= current_date - 30 AND d."day" < current_date - 2 AND d."in_stock"
        GROUP BY 1 HAVING count(*) >= ${MIN_HISTORY_DAYS}
      ), drops AS (
        SELECT DISTINCT ON (c.pid) c.pid, c.lid, c.platform_id, c.price, r.med, r.days,
               1 - c.price / r.med::numeric AS pct
        FROM cur c JOIN ref r ON r.lid = c.lid
        WHERE 1 - c.price / r.med::numeric BETWEEN ${MIN_DROP} AND ${MAX_DROP}
          AND r.med::numeric - c.price >= ${MIN_SAVING_EGP}
        ORDER BY c.pid, pct DESC
      )
      SELECT d.pid, d.lid, d.price, d.med, d.days, d.pct,
             p."slug", p."title", p."title_ar", p."brand", COALESCE(p."thumbnail_url", p."image_url") AS image,
             cat."slug" AS category_slug, pl."name" AS store, pl."slug" AS store_slug,
             (SELECT count(DISTINCT c2.platform_id) FROM cur c2 WHERE c2.pid = d.pid) AS stores
      FROM drops d
      JOIN "canonical_products" p ON p."id" = d.pid
      JOIN "categories" cat ON cat."id" = p."category_id"
      JOIN "platforms" pl ON pl."id" = d.platform_id
      ORDER BY d.pct DESC
      LIMIT 500`);

    return rows.map((r) => ({
      productId: String(r.pid),
      slug: String(r.slug),
      title: String(r.title),
      titleAr: (r.title_ar as string | null) ?? null,
      brand: (r.brand as string | null) ?? null,
      imageUrl: (r.image as string | null) ?? null,
      categorySlug: String(r.category_slug),
      listingId: String(r.lid),
      store: String(r.store),
      storeSlug: String(r.store_slug),
      price: Math.round(num(r.price)),
      usualPrice: Math.round(num(r.med)),
      dropPct: Math.round(num(r.pct) * 100),
      historyDays: num(r.days),
      storeCount: num(r.stores),
    }));
  }
}
