import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus, Prisma, ProductTier } from '@prisma/client';
import type { CanonicalProduct, SourceListing } from '@prisma/client';
import type { CurrentPricesResponse, PriceHistoryResponse } from '@pricelens/contracts';
import { PrismaService } from '../database/prisma.service';
import { OfferPolicy, liveOfferSql, liveOfferWhere, liveOffers, toPrice } from '../prices/offer-rules';
import { HistoryRow, buildPriceHistory, recordedPriceStats } from '../prices/price-history';
import { IngestionQueue } from '../workers/ingestion-queue.service';

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

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Coerces untrusted pagination input into a usable positive integer. */
function clampPageSize(value: unknown, fallback: number, max: number): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function clampPageNumber(value: unknown): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

@Injectable()
export class ProductsService {
  /** Currency every `priceUsd` column is normalized to at ingestion time (see FxRatesService). */
  private readonly baseCurrency: string;

  /** Every product should be comparable across at least this many priced stores. */
  private readonly minStoresPerProduct: number;

  /** How old an offer may be and still count as a current price (D-13). */
  private readonly offerMaxAgeDays: number;

  /** Day boundary for price charts. */
  private readonly marketTimeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ingestionQueue: IngestionQueue,
  ) {
    this.baseCurrency = this.config.get<string>('pricing.fxBaseCurrency', 'EGP');
    this.minStoresPerProduct = this.config.get<number>('retailers.minStoresPerProduct', 7);
    this.offerMaxAgeDays = this.config.get<number>('pricing.offerMaxAgeDays', 7);
    this.marketTimeZone = this.config.get<string>('pricing.marketTimeZone', 'Africa/Cairo');
  }

  private offerPolicy(): OfferPolicy {
    return { maxAgeDays: this.offerMaxAgeDays };
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
    // `page`/`limit` arrive straight from public query-string input, so a
    // non-numeric or oversized value must not reach the SQL or blow up the
    // response shape (NaN previously produced `LIMIT NaN` and a null page).
    const safeLimit = clampPageSize(limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const rawPage = clampPageNumber(page);
    const offset = (rawPage - 1) * safeLimit;

    const whereClause = this.buildSearchWhereSql(normalizedQuery, brand, categoryId, tier);
    const havingClause = this.buildHavingSql(minPrice, maxPrice);
    const relevanceSql = this.buildRelevanceScoreSql(normalizedQuery);
    const orderBySql = this.buildOrderBySql(sortBy, sortDir, relevanceSql, normalizedQuery);

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
        LIMIT ${safeLimit} OFFSET ${offset}
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
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
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

      // Same coverage guarantee as the product detail page (getBySlug below), but
      // for the listing/grid view: a card showing "1 store" wouldn't otherwise
      // get expanded until someone opens that specific product. triggerStoreExpansion
      // already dedups per product (Bull jobId) and cools down for 5 minutes, so
      // firing it for every under-covered hit on the page is safe to repeat per search.
      for (const product of products) {
        if (this.countDistinctStores(product as ProductWithRelations) < this.minStoresPerProduct) {
          void this.triggerStoreExpansion(product.id);
        }
      }
    }

    return {
      hits,
      total,
      query: q.trim(),
      processingTimeMs: 0,
      page: currentPage,
      limit: safeLimit,
      liveFetchTriggered,
    };
  }

  private buildSearchWhereSql(
    normalizedQuery: string,
    brand?: string,
    categoryId?: string,
    tier?: string,
  ): Prisma.Sql {
    // Only live offers count: a product's price filter, price sort and
    // listing count use the same offers its card and page show (L-15).
    const conditions: Prisma.Sql[] = [liveOfferSql('sl', this.offerPolicy())];

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

  private buildOrderBySql(
    sortBy: SortBy,
    sortDir: SortDir,
    relevanceSql: Prisma.Sql,
    normalizedQuery = '',
  ): Prisma.Sql {
    if (sortBy === 'relevance' && !normalizedQuery) {
      // Browsing with no query: relevance is the same for everything, so show
      // the products compared across the most stores first rather than the
      // cheapest (which surfaced a page of $2 earphones).
      return Prisma.sql`COUNT(DISTINCT sl.platform_id) DESC, COUNT(sl.id) DESC, cp.updated_at DESC`;
    }
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
      await this.ingestionQueue.enqueueQueryIngestion(query, 12);
      this.lastLiveFetchAt.set(query, Date.now());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Per-product cooldown so repeated views of a short-store product don't re-queue
   * the search. Concurrent views are already deduped by Bull's jobId (see
   * triggerStoreExpansion below), so this only paces re-attempts *after* a prior
   * run finished — kept short (not zero) so a permanently-undercovered product
   * getting hammered with views doesn't re-scrape every missing store on every hit.
   */
  private static readonly STORE_EXPANSION_COOLDOWN_MS = 30 * 1000;
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
      await this.ingestionQueue.enqueueStoreExpansion(productId, this.minStoresPerProduct);
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

    // Only stores that actually sell this product right now, at a believable
    // price (see visibleListings).
    product.sourceListings = this.visibleListings(product.sourceListings);

    // Keep every product comparable across the target number of stores: if it's
    // short, kick off a background spec-based search of the remaining stores.
    if (this.countDistinctStores(product as ProductWithRelations) < this.minStoresPerProduct) {
      void this.triggerStoreExpansion(product.id);
    }

    return this.mapProduct(product as ProductWithRelations, true);
  }

  async getListings(productId: string, page = 1, limit = 50) {
    limit = clampPageSize(limit, 50, MAX_PAGE_SIZE);
    page = clampPageNumber(page);
    // Only live offers (see offer-rules). Filtered in memory rather than
    // paged in SQL: dedupe and the outlier check depend on the product's
    // other listings, which a page does not contain. A product has tens of
    // listings, not thousands.
    const all = await this.prisma.sourceListing.findMany({
      where: {
        canonicalProductId: productId,
        ...liveOfferWhere(this.offerPolicy()),
      },
      include: { platform: true },
      orderBy: [{ priceUsd: 'asc' }, { lastSeenAt: 'desc' }],
    });
    const visible = this.visibleListings(all);
    const total = visible.length;
    const items = visible.slice((page - 1) * limit, page * limit);

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

    const withPrice = this.visibleListings(product.sourceListings);
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

  /**
   * Recorded-price statistics (L-13): the lowest and highest price the
   * product's live-matched listings were ever recorded at, and over the last
   * 365 days. They used to be the current min/max under an "All-time" label.
   */
  async getPriceStats(productId: string) {
    await this.requireProduct(productId);
    const rows = await this.historyRows(productId);
    return recordedPriceStats(rows);
  }

  /**
   * The daily best-price chart and its summary (L-14): history of the
   * listings currently matched to the product (not rejected ones, not ones
   * since moved to another product), forward-filled per listing, in market
   * days.
   */
  async getPriceHistory(productId: string, days = 90): Promise<PriceHistoryResponse> {
    const product = await this.requireProduct(productId);
    const to = new Date();
    const from = new Date(to.getTime() - Math.max(days, 1) * 86_400_000);
    const view = buildPriceHistory(await this.historyRows(productId), { from, to, timeZone: this.marketTimeZone });

    return {
      productId,
      productTitle: product.title,
      days,
      granularity: 'day',
      ...view,
    };
  }

  private async requireProduct(productId: string): Promise<CanonicalProduct> {
    const product = await this.prisma.canonicalProduct.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException(`Product with id "${productId}" not found`);
    }
    return product;
  }

  /** Every recorded price of the listings matching accepted onto this product (stale ones included: history is history). */
  private async historyRows(productId: string): Promise<HistoryRow[]> {
    const history = await this.prisma.priceHistory.findMany({
      where: {
        priceUsd: { gt: 0 },
        sourceListing: {
          canonicalProductId: productId,
          matchStatus: { in: [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT] },
        },
      },
      select: {
        sourceListingId: true,
        recordedAt: true,
        priceUsd: true,
        inStock: true,
        sourceListing: { select: { platformId: true, lastSeenAt: true, platform: { select: { name: true } } } },
      },
      orderBy: { recordedAt: 'asc' },
    });
    return history.map((entry) => ({
      sourceListingId: entry.sourceListingId,
      platformId: entry.sourceListing.platformId,
      platformName: entry.sourceListing.platform.name,
      recordedAt: entry.recordedAt,
      price: Number(entry.priceUsd),
      inStock: entry.inStock,
      lastSeenAt: entry.sourceListing.lastSeenAt,
    }));
  }

  private mapSearchHit(product: ProductWithRelations) {
    const stats = this.getProductStats(product);
    return {
      ...this.mapProduct(product, false),
      minPriceUsd: stats.minPriceUsd,
      maxPriceUsd: stats.maxPriceUsd,
      listingCount: stats.listingCount,
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
   * The listings a shopper should see: live offers (priced, in stock or
   * stock unknown, not rejected, seen within the offer window), one per
   * store and title, and not a price outlier against the product's other
   * stores. The rule lives in prices/offer-rules.ts so the search SQL,
   * intelligence and alerts use the same one.
   *
   * The outlier step is what keeps "Best Deal" honest. It is the lowest price
   * on the page, so a spare part or a fake that slips through matching at a
   * tenth of the real price becomes the headline number.
   */
  private visibleListings<
    T extends {
      priceUsd: unknown;
      inStock?: boolean | null;
      matchStatus?: MatchStatus;
      platformId?: string;
      rawTitle?: string;
      lastSeenAt?: Date;
    },
  >(listings: T[]): T[] {
    return liveOffers(listings, this.offerPolicy());
  }

  /** A product with three listings from one retailer is still sold at one store. */
  private countDistinctStores(product: ProductWithRelations): number {
    return new Set(this.visibleListings(product.sourceListings).map((listing) => listing.platformId)).size;
  }

  private mapListing(
    listing: ProductWithRelations['sourceListings'][number],
  ) {
    // `price`/`currency` are the store's own, unconverted price — what a buyer
    // actually pays there — always paired with its own currency label so a
    // Carrefour AED price is never shown next to an "EGP" label. `priceUsd` is
    // the FX-normalized (base-currency) value used only for cross-store
    // comparisons (best-deal ranking, sorting), never for display.
    const { price: displayPrice, currency: displayCurrency } = this.displayPrice(listing);
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
      rawPrice: displayPrice,
      rawCurrency: displayCurrency,
      originalPrice: this.toNumber(listing.rawPrice),
      originalCurrency: listing.rawCurrency,
      rawImageUrl: listing.rawImageUrl,
      priceUsd: this.toNumber(listing.priceUsd),
      price: displayPrice,
      currency: displayCurrency,
      inStock: listing.inStock,
      // The offer's own color, read from its title at ingestion (D-6: every
      // color of a model shares the product; phase 06 filters offers by it).
      color: this.offerColor(listing.extractedAttributes),
      rating: listing.rating,
      reviewCount: listing.reviewCount,
      matchStatus: listing.matchStatus,
      matchConfidence: listing.matchConfidence,
      firstSeenAt: listing.firstSeenAt.toISOString(),
      lastSeenAt: listing.lastSeenAt.toISOString(),
      lastScrapedAt: listing.lastScrapedAt?.toISOString() ?? null,
    };
  }

  private offerColor(extracted: unknown): string | null {
    const color = (extracted as Record<string, unknown> | null)?.color;
    return typeof color === 'string' && color.trim() ? color.trim() : null;
  }

  private mapCurrentPriceListing(
    listing: ProductWithRelations['sourceListings'][number],
  ) {
    // Same display rule as mapListing.
    const { price, currency } = this.displayPrice(listing);
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
      currency,
      url: listing.externalUrl,
      inStock: listing.inStock,
      rating: listing.rating,
      reviewCount: listing.reviewCount,
      lastSeenAt: listing.lastSeenAt.toISOString(),
    };
  }

  /**
   * The price and currency a listing is shown in. A store pricing in the base
   * currency is shown exactly as it charges. A store that priced in another
   * currency -- Alibaba answering this server in SAR because its IP looks
   * Saudi -- is shown in the base currency via the FX-normalized priceUsd, so
   * shoppers compare EGP with EGP instead of reading riyals next to pounds.
   * The store's own figure stays available as originalPrice/originalCurrency.
   */
  private displayPrice(listing: { rawPrice: unknown; rawCurrency: string; priceUsd: unknown }): {
    price: number | null;
    currency: string;
  } {
    const raw = this.toNumber(listing.rawPrice);
    const normalized = this.toNumber(listing.priceUsd);
    if (listing.rawCurrency?.toUpperCase() !== this.baseCurrency.toUpperCase() && normalized != null) {
      return { price: normalized, currency: this.baseCurrency };
    }
    return { price: raw ?? normalized, currency: listing.rawCurrency };
  }

  private getProductStats(product: ProductWithListings): ProductStats & { avgPrice: number | null; medianPrice: number | null } {
    const visible = this.visibleListings(product.sourceListings);
    const prices = visible
      .map((listing) => this.toNumber(listing.priceUsd))
      .filter((value): value is number => value != null);

    if (prices.length === 0) {
      return {
        minPriceUsd: null,
        maxPriceUsd: null,
        listingCount: visible.length,
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
      listingCount: visible.length,
      avgPrice: prices.reduce((sum, price) => sum + price, 0) / prices.length,
      medianPrice,
    };
  }

  private toNumber(value: unknown): number | null {
    return toPrice(value);
  }
}
