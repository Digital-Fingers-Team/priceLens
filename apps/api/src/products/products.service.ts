import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import { Prisma, ProductTier } from '@prisma/client';
import type { CanonicalProduct, SourceListing } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  INGESTION_QUEUE,
  RUN_QUERY_INGESTION_JOB,
  RUN_STORE_EXPANSION_JOB,
} from '../workers/ingestion.processor';

type SortBy = 'relevance' | 'minPriceUsd' | 'maxPriceUsd' | 'listingCount' | 'updatedAt';
type SortDir = 'asc' | 'desc';

interface SearchProductsOptions {
  liveFetch?: boolean;
  q?: string;
  brand?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  tier?: string;
  page?: number;
  limit?: number;
  sortBy?: SortBy;
  sortDir?: SortDir;
}

interface ProductWithRelations extends CanonicalProduct {
  category: {
    id: string;
    slug: string;
    name: string;
    parentId: string | null;
    level: number;
    searchTerms: string[];
    createdAt: Date;
  };
  sourceListings: Array<SourceListing & {
    platform: {
      id: string;
      slug: string;
      name: string;
      logoUrl: string | null;
      baseUrl: string;
    };
  }>;
}

interface ProductStats {
  minPriceUsd: number | null;
  maxPriceUsd: number | null;
  listingCount: number;
}

interface ProductWithListings {
  sourceListings: Array<{
    priceUsd: unknown;
  }>;
}

export interface CurrentPricesResponse {
  productId: string;
  listings: Array<{
    id: string;
    platform: {
      id: string;
      slug: string;
      name: string;
      logoUrl: string | null;
      baseUrl: string;
    };
    price: number;
    currency: string;
    url: string;
    inStock: boolean | null;
    rating: number | null;
    reviewCount: number | null;
    lastSeenAt: string;
  }>;
  bestPrice: number | null;
  worstPrice: number | null;
  avgPrice: number | null;
  currency: string;
}

export interface PriceHistoryResponse {
  productId: string;
  productTitle: string;
  days: number;
  granularity: 'day' | 'week' | 'month';
  chart: Array<{
    date: string;
    min: number | null;
    max: number | null;
    avg: number | null;
    count: number;
  }>;
  summary: {
    allTimeMin: number | null;
    allTimeMax: number | null;
    periodMin: number | null;
    periodMax: number | null;
    avgPrice: number | null;
    dataPoints: number;
  };
  platformBreakdown: Array<{
    platformId: string;
    name: string;
    minPrice: number;
    maxPrice: number;
    avgPrice: number;
  }>;
}

@Injectable()
export class ProductsService {
  /** Currency every `priceUsd` column is normalized to at ingestion time (see FxRatesService). */
  private readonly baseCurrency: string;

  /** Every product should be comparable across at least this many priced stores. */
  private readonly minStoresPerProduct: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(INGESTION_QUEUE) private readonly ingestionQueue: Queue,
  ) {
    this.baseCurrency = this.config.get<string>('pricing.fxBaseCurrency', 'EGP');
    this.minStoresPerProduct = this.config.get<number>('retailers.minStoresPerProduct', 7);
  }

  async searchProducts(options: SearchProductsOptions) {
    const {
      q = '',
      brand,
      categoryId,
      minPrice,
      maxPrice,
      tier,
      page = 1,
      limit = 20,
      sortBy = 'relevance',
      sortDir = 'desc',
      liveFetch = true,
    } = options;

    const normalizedQuery = q.trim().toLowerCase();
    const rawPage = Math.max(page, 1);
    const offset = (rawPage - 1) * limit;

    const whereClause = this.buildSearchWhereSql(normalizedQuery, brand, categoryId, tier);
    const havingClause = this.buildHavingSql(minPrice, maxPrice);
    const relevanceSql = this.buildRelevanceScoreSql(normalizedQuery);
    const orderBySql = this.buildOrderBySql(sortBy, sortDir, relevanceSql);

    // Sort/filter/paginate at the DB level first — only the current page's
    // products get their full listings fetched, instead of pulling every
    // matching product's entire listing set just to sort and slice 20 out of it.
    const [pageRows, countRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT cp.id
        FROM canonical_products cp
        JOIN categories c ON c.id = cp.category_id
        JOIN source_listings sl ON sl.canonical_product_id = cp.id
        WHERE ${whereClause}
        GROUP BY cp.id
        ${havingClause}
        ORDER BY ${orderBySql}
        LIMIT ${limit} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint as count FROM (
          SELECT cp.id
          FROM canonical_products cp
          JOIN categories c ON c.id = cp.category_id
          JOIN source_listings sl ON sl.canonical_product_id = cp.id
          WHERE ${whereClause}
          GROUP BY cp.id
          ${havingClause}
        ) matched
      `),
    ]);

    const total = Number(countRows[0]?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const currentPage = Math.min(rawPage, totalPages);

    let liveFetchTriggered = false;
    if (liveFetch && normalizedQuery) {
      liveFetchTriggered = await this.triggerOnDemandLiveFetch(normalizedQuery);
    }

    const pageIds = pageRows.map((row) => row.id);
    let hits: ReturnType<ProductsService['mapSearchHit']>[] = [];

    if (pageIds.length > 0) {
      const products = await this.prisma.canonicalProduct.findMany({
        where: { id: { in: pageIds } },
        include: { category: true, sourceListings: { include: { platform: true } } },
      });
      const productsById = new Map(products.map((product) => [product.id, product]));
      hits = pageIds
        .map((id) => productsById.get(id))
        .filter((product) => !!product)
        .map((product) => this.mapSearchHit(product as ProductWithRelations));
    }

    return {
      hits,
      total,
      query: q.trim(),
      processingTimeMs: 0,
      page: currentPage,
      limit,
      liveFetchTriggered,
    };
  }

  private buildSearchWhereSql(
    normalizedQuery: string,
    brand?: string,
    categoryId?: string,
    tier?: string,
  ): Prisma.Sql {
    const conditions: Prisma.Sql[] = [Prisma.sql`sl.price_usd IS NOT NULL`];

    for (const term of normalizedQuery.split(/\s+/).filter(Boolean)) {
      const pattern = `%${term}%`;
      conditions.push(Prisma.sql`(
        cp.title ILIKE ${pattern} OR
        cp.brand ILIKE ${pattern} OR
        cp.model ILIKE ${pattern} OR
        cp.slug ILIKE ${pattern} OR
        EXISTS (SELECT 1 FROM unnest(string_to_array(lower(c.name), ' ')) tok WHERE tok = ${term}) OR
        EXISTS (SELECT 1 FROM unnest(c.search_terms) st WHERE st ILIKE ${pattern})
      )`);
    }

    if (brand) {
      conditions.push(Prisma.sql`cp.brand ILIKE ${brand}`);
    }
    if (categoryId) {
      conditions.push(Prisma.sql`cp.category_id = ${categoryId}`);
    }
    if (tier && (Object.values(ProductTier) as string[]).includes(tier)) {
      conditions.push(Prisma.sql`cp.tier = ${tier}::"ProductTier"`);
    }

    return Prisma.join(conditions, ' AND ');
  }

  private buildHavingSql(minPrice?: number, maxPrice?: number): Prisma.Sql {
    const parts: Prisma.Sql[] = [];
    if (minPrice != null) {
      parts.push(Prisma.sql`MIN(sl.price_usd) >= ${minPrice}`);
    }
    if (maxPrice != null) {
      parts.push(Prisma.sql`MAX(sl.price_usd) <= ${maxPrice}`);
    }
    return parts.length ? Prisma.sql`HAVING ${Prisma.join(parts, ' AND ')}` : Prisma.empty;
  }

  private buildOrderBySql(sortBy: SortBy, sortDir: SortDir, relevanceSql: Prisma.Sql): Prisma.Sql {
    if (sortBy === 'relevance') {
      const direction = sortDir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
      return Prisma.sql`MAX(${relevanceSql}) ${direction}, MIN(sl.price_usd) ASC NULLS LAST, cp.updated_at DESC`;
    }

    const column = {
      minPriceUsd: Prisma.sql`MIN(sl.price_usd)`,
      maxPriceUsd: Prisma.sql`MAX(sl.price_usd)`,
      listingCount: Prisma.sql`COUNT(sl.id)`,
      updatedAt: Prisma.sql`cp.updated_at`,
    }[sortBy];

    const direction = sortDir === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    return Prisma.sql`${column} ${direction} NULLS LAST, cp.updated_at DESC`;
  }

  /**
   * Titles like "iPhone 17" satisfy `ILIKE '%phone%'` purely because "iPhone"
   * contains that substring — so a case titled "... for iPhone 17 ..." scores
   * the same as the phone itself on title match, then wins on the price
   * tie-break for being cheaper. Demoting known accessory nouns (unless the
   * query itself asks for one) keeps the base product above its accessories
   * for any category, not just phones.
   */
  private static readonly ACCESSORY_KEYWORDS = [
    'case', 'cover', 'protector', 'skin', 'pod', 'bumper', 'sleeve', 'pouch',
    'stand', 'mount', 'strap', 'charger', 'cable', 'tempered glass', 'screen guard',
  ];

  /**
   * Weighted relevance score for ranking search hits. Without this, results were
   * ordered purely by price, so a cheap unrelated accessory (e.g. a phone case
   * matching "phone" only through its category) would outrank an actual phone.
   * Title matches are weighted far above category/search-term matches so that
   * loosely-related category matches sink instead of dominating page one.
   */
  private buildRelevanceScoreSql(normalizedQuery: string): Prisma.Sql {
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      return Prisma.sql`0`;
    }

    const termScores = terms.map((term) => {
      const contains = `%${term}%`;
      const startsWith = `${term}%`;
      return Prisma.sql`(
        CASE
          WHEN cp.title ILIKE ${startsWith} THEN 12
          WHEN cp.title ILIKE ${contains} THEN 6
          ELSE 0
        END +
        CASE
          WHEN cp.brand ILIKE ${term} THEN 10
          WHEN cp.brand ILIKE ${contains} THEN 4
          ELSE 0
        END +
        CASE WHEN cp.model ILIKE ${contains} THEN 6 ELSE 0 END +
        CASE
          WHEN EXISTS (SELECT 1 FROM unnest(string_to_array(lower(c.name), ' ')) tok WHERE tok = ${term}) THEN 5
          ELSE 0
        END +
        CASE
          WHEN EXISTS (SELECT 1 FROM unnest(c.search_terms) st WHERE st ILIKE ${contains}) THEN 2
          ELSE 0
        END
      )`;
    });

    const fullPhraseBonus = Prisma.sql`(
      CASE
        WHEN cp.title ILIKE ${normalizedQuery} THEN 50
        WHEN cp.title ILIKE ${`${normalizedQuery}%`} THEN 20
        WHEN cp.title ILIKE ${`%${normalizedQuery}%`} THEN 8
        ELSE 0
      END
    )`;

    const queryAsksForAccessory = ProductsService.ACCESSORY_KEYWORDS.some((keyword) =>
      normalizedQuery.includes(keyword),
    );
    const accessoryPenalty = queryAsksForAccessory
      ? Prisma.sql`0`
      : Prisma.sql`(CASE WHEN ${Prisma.join(
          ProductsService.ACCESSORY_KEYWORDS.map((keyword) => Prisma.sql`cp.title ILIKE ${`%${keyword}%`}`),
          ' OR ',
        )} THEN -20 ELSE 0 END)`;

    return Prisma.sql`(${fullPhraseBonus} + ${accessoryPenalty} + ${Prisma.join(termScores, ' + ')})`;
  }

  /** Per-query cooldown so repeat searches (pagination, sorting, retyping) don't re-scrape. */
  private static readonly LIVE_FETCH_COOLDOWN_MS = 30 * 1000;
  private readonly lastLiveFetchAt = new Map<string, number>();

  /**
   * Queues a background job that searches connectors for what the user actually typed,
   * instead of blocking the search request on it. Results are served from the DB
   * immediately while this refreshes prices/products from the retailer APIs. The jobId
   * dedups concurrent triggers for the same query — Bull returns the existing job instead
   * of piling up duplicate scrapes while one is in flight — and the cooldown map skips
   * queries that were already refreshed recently.
   */
  private async triggerOnDemandLiveFetch(query: string): Promise<boolean> {
    const lastRun = this.lastLiveFetchAt.get(query);
    if (lastRun != null && Date.now() - lastRun < ProductsService.LIVE_FETCH_COOLDOWN_MS) {
      return false;
    }

    try {
      await this.ingestionQueue.add(
        RUN_QUERY_INGESTION_JOB,
        { query, limitPerQuery: 12 },
        {
          jobId: `on-demand-live-fetch:${query}`,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      this.lastLiveFetchAt.set(query, Date.now());
      return true;
    } catch {
      return false;
    }
  }

  /** Per-product cooldown so repeated views of a short-store product don't re-queue the search. */
  private static readonly STORE_EXPANSION_COOLDOWN_MS = 5 * 60 * 1000;
  private readonly lastStoreExpansionAt = new Map<string, number>();

  /**
   * Queues a background job that searches the stores which don't yet carry this
   * product (by its brand/model/storage specs) to push it toward the target store
   * count. Deduped by product id (Bull returns the in-flight job) and throttled by
   * a cooldown so browsing the same product doesn't pile up scrapes.
   */
  private async triggerStoreExpansion(productId: string): Promise<boolean> {
    const lastRun = this.lastStoreExpansionAt.get(productId);
    if (lastRun != null && Date.now() - lastRun < ProductsService.STORE_EXPANSION_COOLDOWN_MS) {
      return false;
    }

    try {
      await this.ingestionQueue.add(
        RUN_STORE_EXPANSION_JOB,
        { productId, targetStores: this.minStoresPerProduct },
        {
          jobId: `store-expansion:${productId}`,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      this.lastStoreExpansionAt.set(productId, Date.now());
      return true;
    } catch {
      return false;
    }
  }

  async suggest(q: string, limit = 6) {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return [];

    const products = await this.prisma.canonicalProduct.findMany({
      where: {
        sourceListings: {
          some: {
            priceUsd: { not: null },
          },
        },
      },
      include: { category: true },
    });

    return products
      .filter((product) => {
        // Category name is matched as whole words only (not "haystack.includes"),
        // otherwise a query like "phone" substring-matches the "Headphones"
        // category and floods phone suggestions with earbuds/headphones.
        const haystack = [product.title, product.brand ?? '', product.model ?? '', product.slug]
          .join(' ')
          .toLowerCase();
        const categoryTokens = product.category.name.toLowerCase().split(/\s+/);
        const queryTerms = query.split(/\s+/).filter(Boolean);
        return (
          queryTerms.length > 0 &&
          queryTerms.every((term) => haystack.includes(term) || categoryTokens.includes(term))
        );
      })
      .sort((a, b) => {
        const aStarts = a.title.toLowerCase().startsWith(query) ? 0 : 1;
        const bStarts = b.title.toLowerCase().startsWith(query) ? 0 : 1;
        return aStarts - bStarts || a.title.localeCompare(b.title);
      })
      .slice(0, limit)
      .map((product) => ({
        id: product.id,
        slug: product.slug,
        title: product.title,
        brand: product.brand,
      }));
  }

  async getBySlug(slug: string) {
    const product = await this.prisma.canonicalProduct.findUnique({
      where: { slug },
      include: {
        category: true,
        sourceListings: {
          include: { platform: true },
          orderBy: [{ priceUsd: 'asc' }, { lastSeenAt: 'desc' }],
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with slug "${slug}" not found`);
    }

    // Drop priceless / out-of-stock listings so the detail page only shows stores
    // that actually have a price for this product right now.
    product.sourceListings = product.sourceListings.filter((listing) =>
      this.hasUsablePrice(listing),
    );

    // Keep every product comparable across the target number of stores: if it's
    // short, kick off a background spec-based search of the remaining stores.
    if (this.countDistinctStores(product as ProductWithRelations) < this.minStoresPerProduct) {
      void this.triggerStoreExpansion(product.id);
    }

    return this.mapProduct(product as ProductWithRelations, true);
  }

  async getListings(productId: string, page = 1, limit = 50) {
    // Out-of-stock listings come back with no price; exclude them so callers only
    // see stores the product can actually be bought from.
    const where: Prisma.SourceListingWhereInput = {
      canonicalProductId: productId,
      priceUsd: { not: null },
      NOT: { inStock: false },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.sourceListing.findMany({
        where,
        include: { platform: true },
        orderBy: [{ priceUsd: 'asc' }, { lastSeenAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.sourceListing.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapListing(item)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getCurrentPrices(productId: string): Promise<CurrentPricesResponse> {
    const product = await this.prisma.canonicalProduct.findUnique({
      where: { id: productId },
      include: {
        sourceListings: {
          include: { platform: true },
          orderBy: [{ priceUsd: 'asc' }, { lastSeenAt: 'desc' }],
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with id "${productId}" not found`);
    }

    const withPrice = product.sourceListings.filter((listing) => listing.priceUsd != null);
    const listings = withPrice.map((listing) => this.mapCurrentPriceListing(listing));

    // best/worst/avg rank listings against each other, so they must use the
    // FX-normalized priceUsd (base currency) — NOT `listings[].price`, which is
    // deliberately each store's raw, un-converted local price for display.
    const normalizedPrices = withPrice
      .map((listing) => this.toNumber(listing.priceUsd))
      .filter((value): value is number => value != null);

    return {
      productId,
      listings,
      bestPrice: normalizedPrices.length ? Math.min(...normalizedPrices) : null,
      worstPrice: normalizedPrices.length ? Math.max(...normalizedPrices) : null,
      avgPrice: normalizedPrices.length
        ? normalizedPrices.reduce((sum, price) => sum + price, 0) / normalizedPrices.length
        : null,
      currency: this.baseCurrency,
    };
  }

  async getPriceStats(productId: string) {
    const product = await this.prisma.canonicalProduct.findUnique({
      where: { id: productId },
      include: {
        sourceListings: {
          include: { platform: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with id "${productId}" not found`);
    }

    const stats = this.getProductStats(product);
    const prices = (product.sourceListings ?? [])
      .map((listing) => this.toNumber(listing.priceUsd))
      .filter((value): value is number => value != null);

    const avg = prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null;

    return {
      allTime: {
        min: stats.minPriceUsd,
        max: stats.maxPriceUsd,
        avg,
        dataPoints: prices.length,
      },
      week52: {
        low: stats.minPriceUsd,
        high: stats.maxPriceUsd,
      },
    };
  }

  async getPriceHistory(productId: string, days = 90): Promise<PriceHistoryResponse> {
    const product = await this.prisma.canonicalProduct.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with id "${productId}" not found`);
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Math.max(days, 1));

    const history = await this.prisma.priceHistory.findMany({
      where: {
        canonicalProductId: productId,
        recordedAt: { gte: startDate },
      },
      include: {
        sourceListing: {
          include: { platform: true },
        },
      },
      orderBy: { recordedAt: 'asc' },
    });

    const chartMap = new Map<string, number[]>();
    for (const entry of history) {
      const key = entry.recordedAt.toISOString().slice(0, 10);
      const value = this.toNumber(entry.priceUsd);
      if (value == null) continue;
      const existing = chartMap.get(key) ?? [];
      existing.push(value);
      chartMap.set(key, existing);
    }

    const chart = Array.from(chartMap.entries()).map(([date, values]) => {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((sum, price) => sum + price, 0) / values.length;
      return {
        date,
        min,
        max,
        avg,
        count: values.length,
      };
    });

    const prices = history
      .map((entry) => this.toNumber(entry.priceUsd))
      .filter((value): value is number => value != null);
    const avgPrice = prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null;

    const platformMap = new Map<string, { name: string; min: number; max: number; total: number; count: number }>();
    for (const entry of history) {
      const value = this.toNumber(entry.priceUsd);
      if (value == null) continue;
      const platformId = entry.sourceListing.platformId;
      const current = platformMap.get(platformId);
      if (!current) {
        platformMap.set(platformId, {
          name: entry.sourceListing.platform.name,
          min: value,
          max: value,
          total: value,
          count: 1,
        });
      } else {
        current.min = Math.min(current.min, value);
        current.max = Math.max(current.max, value);
        current.total += value;
        current.count += 1;
      }
    }

    return {
      productId,
      productTitle: product.title,
      days,
      granularity: 'day',
      chart,
      summary: {
        allTimeMin: prices.length ? Math.min(...prices) : null,
        allTimeMax: prices.length ? Math.max(...prices) : null,
        periodMin: prices.length ? Math.min(...prices) : null,
        periodMax: prices.length ? Math.max(...prices) : null,
        avgPrice,
        dataPoints: prices.length,
      },
      platformBreakdown: Array.from(platformMap.entries()).map(([platformId, value]) => ({
        platformId,
        name: value.name,
        minPrice: value.min,
        maxPrice: value.max,
        avgPrice: value.total / value.count,
      })),
    };
  }

  private mapSearchHit(product: ProductWithRelations) {
    const stats = this.getProductStats(product);
    return {
      ...this.mapProduct(product, false),
      minPriceUsd: stats.minPriceUsd,
      maxPriceUsd: stats.maxPriceUsd,
      listingCount: stats.listingCount,
      _formatted: {
        title: product.title,
        brand: product.brand ?? undefined,
        model: product.model ?? undefined,
      },
    };
  }

  private mapProduct(product: ProductWithRelations, includeListings: boolean) {
    const stats = this.getProductStats(product);

    return {
      id: product.id,
      slug: product.slug,
      categoryId: product.categoryId,
      category: {
        id: product.category.id,
        slug: product.category.slug,
        name: product.category.name,
        parentId: product.category.parentId,
        level: product.category.level,
      },
      title: product.title,
      brand: product.brand,
      model: product.model,
      gtin: product.gtin,
      upc: product.upc,
      ean: product.ean,
      mpn: product.mpn,
      attributes: product.attributes as Record<string, string | number | boolean>,
      imageUrl: product.imageUrl,
      thumbnailUrl: product.thumbnailUrl,
      tier: product.tier,
      isVerified: product.isVerified,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      priceStats: {
        min: stats.minPriceUsd,
        max: stats.maxPriceUsd,
        avg: stats.avgPrice,
        median: stats.medianPrice,
        current: stats.minPriceUsd,
        // min/max/avg are computed from priceUsd, which is FX-normalized to the
        // base currency (see live-ingestion.service.ts), so this is always the
        // base currency — never a per-listing rawCurrency.
        currency: this.baseCurrency,
      },
      storeCount: this.countDistinctStores(product),
      ...(includeListings
        ? {
            sourceListings: product.sourceListings.map((listing) => this.mapListing(listing)),
            _count: { sourceListings: product.sourceListings.length },
          }
        : {}),
    };
  }

  /**
   * A store only counts when it actually has a price for the product. Retailers
   * return out-of-stock items with no price; those aren't a real price source, so
   * they're excluded from the store count everywhere it's shown.
   */
  private hasUsablePrice(listing: { priceUsd: unknown; inStock?: boolean | null }): boolean {
    const price = this.toNumber(listing.priceUsd);
    return price != null && price > 0 && listing.inStock !== false;
  }

  /** A product with three listings from one retailer is still sold at one store. */
  private countDistinctStores(product: ProductWithRelations): number {
    return new Set(
      product.sourceListings
        .filter((listing) => this.hasUsablePrice(listing))
        .map((listing) => listing.platformId),
    ).size;
  }

  private mapListing(
    listing: ProductWithRelations['sourceListings'][number],
  ) {
    // `price`/`currency` are the store's own, unconverted price — what a buyer
    // actually pays there — always paired with its own currency label so a
    // Carrefour AED price is never shown next to an "EGP" label. `priceUsd` is
    // the FX-normalized (base-currency) value used only for cross-store
    // comparisons (best-deal ranking, sorting), never for display.
    const rawPrice = this.toNumber(listing.rawPrice);
    return {
      id: listing.id,
      platformId: listing.platformId,
      platform: {
        id: listing.platform.id,
        slug: listing.platform.slug,
        name: listing.platform.name,
        logoUrl: listing.platform.logoUrl,
        baseUrl: listing.platform.baseUrl,
      },
      externalId: listing.externalId,
      externalUrl: listing.externalUrl,
      url: listing.externalUrl,
      rawTitle: listing.rawTitle,
      rawPrice,
      rawCurrency: listing.rawCurrency,
      rawImageUrl: listing.rawImageUrl,
      priceUsd: this.toNumber(listing.priceUsd),
      price: rawPrice ?? this.toNumber(listing.priceUsd),
      currency: listing.rawCurrency,
      inStock: listing.inStock,
      rating: listing.rating,
      reviewCount: listing.reviewCount,
      matchStatus: listing.matchStatus,
      matchConfidence: listing.matchConfidence,
      firstSeenAt: listing.firstSeenAt.toISOString(),
      lastSeenAt: listing.lastSeenAt.toISOString(),
      lastScrapedAt: listing.lastScrapedAt?.toISOString() ?? null,
    };
  }

  private mapCurrentPriceListing(
    listing: ProductWithRelations['sourceListings'][number],
  ) {
    // Same raw-price-first rule as mapListing: this is what the buyer pays at
    // that specific store, so it must carry that store's own currency.
    const price = this.toNumber(listing.rawPrice) ?? this.toNumber(listing.priceUsd);
    if (price == null) {
      throw new Error('Current price listing requires a numeric price');
    }

    return {
      id: listing.id,
      platform: {
        id: listing.platform.id,
        slug: listing.platform.slug,
        name: listing.platform.name,
        logoUrl: listing.platform.logoUrl,
        baseUrl: listing.platform.baseUrl,
      },
      price,
      currency: listing.rawCurrency,
      url: listing.externalUrl,
      inStock: listing.inStock,
      rating: listing.rating,
      reviewCount: listing.reviewCount,
      lastSeenAt: listing.lastSeenAt.toISOString(),
    };
  }

  private getProductStats(product: ProductWithListings): ProductStats & { avgPrice: number | null; medianPrice: number | null } {
    const prices = product.sourceListings
      .map((listing) => this.toNumber(listing.priceUsd))
      .filter((value): value is number => value != null);

    if (prices.length === 0) {
      return {
        minPriceUsd: null,
        maxPriceUsd: null,
        listingCount: product.sourceListings.length,
        avgPrice: null,
        medianPrice: null,
      };
    }

    const sorted = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianPrice =
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];

    return {
      minPriceUsd: sorted[0],
      maxPriceUsd: sorted[sorted.length - 1],
      listingCount: product.sourceListings.length,
      avgPrice: prices.reduce((sum, price) => sum + price, 0) / prices.length,
      medianPrice,
    };
  }

  private toNumber(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
