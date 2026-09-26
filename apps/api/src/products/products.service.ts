import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus } from '@prisma/client';
import type { CanonicalProduct, SourceListing } from '@prisma/client';
import type { CurrentPricesResponse, PriceHistoryResponse } from '@pricelens/contracts';
import { PrismaService } from '../database/prisma.service';
import { OfferPolicy, liveOfferWhere, liveOffers, toPrice } from '../prices/offer-rules';
import { HistoryRow, buildPriceHistory, recordedPriceStats } from '../prices/price-history';
import { IngestionQueue } from '../workers/ingestion-queue.service';

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

  /**
   * Search hits for a page of product ids, in the order given (SearchService
   * ranks, this maps). Under-covered products get a background store
   * expansion, the same coverage guarantee as the product page: a card showing
   * "1 store" would otherwise wait until someone opens that product.
   */
  async searchHits(ids: string[]) {
    if (ids.length === 0) return [];
    const products = (await this.prisma.canonicalProduct.findMany({
      where: { id: { in: ids } },
      include: { category: true, sourceListings: { include: { platform: true } } },
    })) as ProductWithRelations[];

    for (const product of products) {
      if (this.countDistinctStores(product) < this.minStoresPerProduct) {
        void this.triggerStoreExpansion(product.id);
      }
    }

    const byId = new Map(products.map((product) => [product.id, product]));
    return ids.flatMap((id) => {
      const product = byId.get(id);
      return product ? [this.mapSearchHit(product)] : [];
    });
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
