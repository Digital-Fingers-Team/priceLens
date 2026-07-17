import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus, ProductTier, Prisma, ScrapingJobStatus, Platform, Category } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NormalizerService } from '../matching/normalizer.service';
import { FuzzyMatcherService } from '../matching/fuzzy-matcher.service';
import { SemanticService } from '../matching/semantic.service';
import { FxRatesService } from '../matching/fx-rates.service';
import { AmazonConnector } from './connectors/amazon.connector';
import { AlibabaConnector } from './connectors/alibaba.connector';
import { AliExpressConnector } from './connectors/aliexpress.connector';
import { NoonConnector } from './connectors/noon.connector';
import { JumiaConnector } from './connectors/jumia.connector';
import { CarrefourConnector } from './connectors/carrefour.connector';
import { TwoBConnector } from './connectors/twob.connector';
import { ElarabyConnector } from './connectors/elaraby.connector';
import { RetailerConnector } from './interfaces/retailer-connector.interface';
import { RetailerListing } from './interfaces/retailer-listing.interface';

/**
 * Minimum combined fuzzy score (token overlap + Jaccard + edit similarity) for
 * merging a scraped listing into an existing canonical product from another store.
 * High on purpose: a wrong merge (two different products shown as one) is worse
 * than a missed merge (same product shown twice).
 */
const FUZZY_MATCH_THRESHOLD = 0.85;

/**
 * Score assigned to a survivor whose extracted model number exactly matches
 * the listing's (see the `modelsAgree` boost below). Kept as a named constant
 * so the auto-accept fast path and the boost that produces this score can't
 * drift apart.
 */
const MODEL_AGREEMENT_SCORE = 0.95;

export interface LiveIngestionOptions {
  platformSlugs?: string[];
  limitPerQuery?: number;
}

export interface IngestionSummary {
  platformSlug: string;
  platformName: string;
  jobId: string;
  queriesRun: number;
  listingsDiscovered: number;
  listingsUpserted: number;
  canonicalProductsCreated: number;
  canonicalProductsMatched: number;
  priceHistoryEntries: number;
}

export interface IngestionReport {
  startedAt: string;
  finishedAt: string;
  platforms: IngestionSummary[];
  skippedPlatforms: Array<{ slug: string; reason: string }>;
}

@Injectable()
export class LiveIngestionService {
  private readonly logger = new Logger(LiveIngestionService.name);
  private readonly connectorsBySlug: Map<string, RetailerConnector>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly normalizer: NormalizerService,
    private readonly fuzzyMatcher: FuzzyMatcherService,
    private readonly semantic: SemanticService,
    private readonly fxRates: FxRatesService,
    private readonly amazonConnector: AmazonConnector,
    private readonly alibabaConnector: AlibabaConnector,
    private readonly aliExpressConnector: AliExpressConnector,
    private readonly noonConnector: NoonConnector,
    private readonly jumiaConnector: JumiaConnector,
    private readonly carrefourConnector: CarrefourConnector,
    private readonly twoBConnector: TwoBConnector,
    private readonly elarabyConnector: ElarabyConnector,
    private readonly configService: ConfigService,
  ) {
    const connectors: RetailerConnector[] = [
      this.amazonConnector,
      this.alibabaConnector,
      this.aliExpressConnector,
      this.noonConnector,
      this.jumiaConnector,
      this.carrefourConnector,
      this.twoBConnector,
      this.elarabyConnector,
    ];
    this.connectorsBySlug = new Map(connectors.map((connector) => [connector.slug, connector]));
  }

  async runLiveIngestion(options: LiveIngestionOptions = {}): Promise<IngestionReport> {
    const startedAt = new Date();
    const availableConnectorSlugs = Array.from(this.connectorsBySlug.keys());
    const requestedPlatforms = options.platformSlugs?.length
      ? options.platformSlugs.map((slug) => slug.toLowerCase())
      : availableConnectorSlugs;

    const limitPerQuery = Math.max(
      1,
      options.limitPerQuery ?? this.configService.get<number>('retailers.liveIngestionLimit', 25),
    );

    const platforms = await this.prisma.platform.findMany({
      where: {
        slug: { in: requestedPlatforms },
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    const foundSlugs = new Set(platforms.map((platform) => platform.slug));

    const skippedPlatforms: Array<{ slug: string; reason: string }> = [];
    const summaries: IngestionSummary[] = [];
    // Products created/touched by the generic sweep below. The cross-store
    // backfill re-queries the other stores for exactly these so the same
    // product can show up from more than one store instead of just "1 store".
    const touchedProductIds = new Set<string>();

    for (const requestedSlug of requestedPlatforms) {
      if (!this.connectorsBySlug.has(requestedSlug)) {
        skippedPlatforms.push({ slug: requestedSlug, reason: 'unsupported_platform' });
      } else if (!foundSlugs.has(requestedSlug)) {
        skippedPlatforms.push({ slug: requestedSlug, reason: 'platform_not_found_or_inactive' });
      }
    }

    for (const platform of platforms) {
      const connector = this.connectorsBySlug.get(platform.slug);
      if (!connector) {
        skippedPlatforms.push({ slug: platform.slug, reason: 'connector_not_implemented' });
        continue;
      }
      if (!connector.isEnabled) {
        skippedPlatforms.push({ slug: platform.slug, reason: 'connector_disabled' });
        continue;
      }

      try {
        summaries.push(await this.ingestPlatform(platform, connector, limitPerQuery, touchedProductIds));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        skippedPlatforms.push({ slug: platform.slug, reason: `ingestion_failed:${message}` });
      }
    }

    await this.backfillCrossStore(platforms, touchedProductIds, summaries);

    const finishedAt = new Date();

    return {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      platforms: summaries,
      skippedPlatforms,
    };
  }

  private async ingestPlatform(
    platform: Platform,
    connector: RetailerConnector,
    limitPerQuery: number,
    touchedProductIds?: Set<string>,
  ): Promise<IngestionSummary> {
    const categories = await this.prisma.category.findMany({
      where: { level: { gt: 0 } },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });

    const categoryQueries = categories.map((category) => ({
      category,
      queries: this.buildQueriesForCategory(category),
    }));

    return this.runIngestionJob(
      platform,
      connector,
      limitPerQuery,
      categoryQueries,
      { categoryCount: categories.length },
      touchedProductIds,
    );
  }

  /**
   * Ingests listings for a single ad hoc search term (what the user actually typed)
   * against one resolved category, instead of sweeping every category's canned queries.
   */
  async runQueryIngestion(
    query: string,
    options: LiveIngestionOptions = {},
  ): Promise<IngestionReport> {
    const startedAt = new Date();
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return { startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), platforms: [], skippedPlatforms: [] };
    }

    const availableConnectorSlugs = Array.from(this.connectorsBySlug.keys());
    const requestedPlatforms = options.platformSlugs?.length
      ? options.platformSlugs.map((slug) => slug.toLowerCase())
      : availableConnectorSlugs;

    const limitPerQuery = Math.max(
      1,
      options.limitPerQuery ?? this.configService.get<number>('retailers.liveIngestionLimit', 25),
    );

    const platforms = await this.prisma.platform.findMany({
      where: { slug: { in: requestedPlatforms }, isActive: true },
      orderBy: { name: 'asc' },
    });

    const foundSlugs = new Set(platforms.map((platform) => platform.slug));
    const skippedPlatforms: Array<{ slug: string; reason: string }> = [];
    const summaries: IngestionSummary[] = [];
    // Products touched by this query on each store — a search for "iphone 16"
    // typically returns a different color/storage mix per store, so without
    // this, each variant ends up looking like it's only sold by one store.
    // backfillCrossStore below re-searches the OTHER stores for the specific
    // variants found here to merge them onto the same canonical product.
    const touchedProductIds = new Set<string>();

    for (const requestedSlug of requestedPlatforms) {
      if (!this.connectorsBySlug.has(requestedSlug)) {
        skippedPlatforms.push({ slug: requestedSlug, reason: 'unsupported_platform' });
      } else if (!foundSlugs.has(requestedSlug)) {
        skippedPlatforms.push({ slug: requestedSlug, reason: 'platform_not_found_or_inactive' });
      }
    }

    const category = await this.resolveCategoryForQuery(trimmedQuery);

    for (const platform of platforms) {
      const connector = this.connectorsBySlug.get(platform.slug);
      if (!connector) {
        skippedPlatforms.push({ slug: platform.slug, reason: 'connector_not_implemented' });
        continue;
      }
      if (!connector.isEnabled) {
        skippedPlatforms.push({ slug: platform.slug, reason: 'connector_disabled' });
        continue;
      }
      if (!category) {
        skippedPlatforms.push({ slug: platform.slug, reason: 'no_matching_category' });
        continue;
      }

      try {
        summaries.push(
          await this.runIngestionJob(
            platform,
            connector,
            limitPerQuery,
            [{ category, queries: [trimmedQuery] }],
            {},
            touchedProductIds,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        skippedPlatforms.push({ slug: platform.slug, reason: `ingestion_failed:${message}` });
      }
    }

    // The scheduled sweep's default cap (40 products) assumes a background job
    // that's fine taking an hour+; an on-demand search from the search box is
    // one query's worth of products (typically a dozen-ish variants) and needs
    // to actually finish in a reasonable time, so cap much tighter here.
    await this.backfillCrossStore(platforms, touchedProductIds, summaries, 8);

    return {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      platforms: summaries,
      skippedPlatforms,
    };
  }

  private async runIngestionJob(
    platform: Platform,
    connector: RetailerConnector,
    limitPerQuery: number,
    categoryQueries: Array<{ category: Category; queries: string[] }>,
    extraPayload: Record<string, unknown> = {},
    touchedProductIds?: Set<string>,
  ): Promise<IngestionSummary> {
    const job = await this.prisma.scrapingJob.create({
      data: {
        platformId: platform.id,
        jobType: 'LIVE_INGESTION',
        status: ScrapingJobStatus.RUNNING,
        priority: 10,
        payload: this.toJson({
          connector: connector.slug,
          limitPerQuery,
          ...extraPayload,
        }),
        startedAt: new Date(),
      },
    });

    const summary: IngestionSummary = {
      platformSlug: platform.slug,
      platformName: platform.name,
      jobId: job.id,
      queriesRun: 0,
      listingsDiscovered: 0,
      listingsUpserted: 0,
      canonicalProductsCreated: 0,
      canonicalProductsMatched: 0,
      priceHistoryEntries: 0,
    };

    const seenExternalIds = new Set<string>();

    try {
      for (const { category, queries } of categoryQueries) {
        for (const query of queries) {
          summary.queriesRun += 1;

          const listings = await connector.searchListings(query, limitPerQuery);

          for (const listing of listings) {
            if (seenExternalIds.has(listing.externalId)) {
              continue;
            }
            seenExternalIds.add(listing.externalId);

            if (listing.priceUsd == null || !Number.isFinite(listing.priceUsd) || listing.priceUsd <= 0) {
              this.logger.warn(
                `Skipping listing "${listing.title}" from ${connector.slug} — no usable price (likely a scrape error, not a real product)`,
              );
              continue;
            }

            summary.listingsDiscovered += 1;

            const result = await this.persistListing(platform, category, listing, connector.slug);
            summary.listingsUpserted += 1;
            summary.priceHistoryEntries += result.priceHistoryCreated ? 1 : 0;
            summary.canonicalProductsCreated += result.createdCanonicalProduct ? 1 : 0;
            summary.canonicalProductsMatched += result.matchedExistingCanonicalProduct ? 1 : 0;
            touchedProductIds?.add(result.canonicalProductId);
          }
        }
      }

      await this.prisma.scrapingJob.update({
        where: { id: job.id },
        data: {
          status: ScrapingJobStatus.COMPLETED,
          completedAt: new Date(),
          result: this.toJson(summary),
        },
      });

      return summary;
    } catch (error) {
      this.logger.error(`Ingestion failed for platform ${platform.slug}`, error as Error);

      await this.prisma.scrapingJob.update({
        where: { id: job.id },
        data: {
          status: ScrapingJobStatus.FAILED,
          completedAt: new Date(),
          error: error instanceof Error ? error.message : String(error),
          result: this.toJson(summary),
        },
      });

      throw error;
    }
  }

  /**
   * Second ingestion phase. The generic category sweep finds each store's own
   * top products for terms like "smartphone", so two stores rarely surface the
   * SAME product and most canonicals end up with only one store's listing.
   *
   * Here we take the products just discovered, build a specific
   * "brand model storage" query for each, and re-search every OTHER enabled
   * store for exactly that product. Any results flow back through the normal
   * persist + match path (findCanonicalMatch), which merges them onto the same
   * canonical — turning a "1 store" product into a real cross-store comparison.
   */
  private async backfillCrossStore(
    platforms: Platform[],
    touchedProductIds: Set<string>,
    summaries: IngestionSummary[],
    maxProductsOverride?: number,
  ): Promise<void> {
    const enabled = this.configService.get<boolean>('retailers.crossStoreBackfillEnabled', true);
    if (!enabled || touchedProductIds.size === 0) {
      return;
    }

    const maxProducts = Math.max(
      0,
      maxProductsOverride ?? this.configService.get<number>('retailers.crossStoreBackfillMaxProducts', 40),
    );
    const limitPerQuery = Math.max(
      1,
      this.configService.get<number>('retailers.crossStoreBackfillLimitPerQuery', 5),
    );
    if (maxProducts === 0) {
      return;
    }

    // Only platforms whose connector is present and enabled can be backfilled.
    const usablePlatforms = platforms.filter((platform) => {
      const connector = this.connectorsBySlug.get(platform.slug);
      return connector?.isEnabled;
    });
    if (usablePlatforms.length < 2) {
      // Nothing to cross-reference against with fewer than two live stores.
      return;
    }

    const summaryBySlug = new Map(summaries.map((summary) => [summary.platformSlug, summary]));

    // Load the touched products together with the set of platforms that already
    // carry a listing for each, so we only re-query the stores that are missing
    // it. Products with the fewest covering stores are prioritized (the "1
    // store" case is exactly what this exists to fix).
    const products = await this.prisma.canonicalProduct.findMany({
      where: { id: { in: Array.from(touchedProductIds) } },
      include: {
        category: true,
        sourceListings: { select: { platformId: true } },
      },
    });

    const ranked = products
      .map((product) => ({
        product,
        coveringPlatformIds: new Set(product.sourceListings.map((listing) => listing.platformId)),
      }))
      .sort((a, b) => a.coveringPlatformIds.size - b.coveringPlatformIds.size)
      .slice(0, maxProducts);

    for (const { product, coveringPlatformIds } of ranked) {
      const query = this.buildProductQuery(product);
      if (!query) {
        continue;
      }

      for (const platform of usablePlatforms) {
        if (coveringPlatformIds.has(platform.id)) {
          continue;
        }
        const connector = this.connectorsBySlug.get(platform.slug);
        if (!connector) {
          continue;
        }

        try {
          const listings = await connector.searchListings(query, limitPerQuery);
          const summary = summaryBySlug.get(platform.slug);

          for (const listing of listings) {
            if (listing.priceUsd == null || !Number.isFinite(listing.priceUsd) || listing.priceUsd <= 0) {
              continue;
            }

            const result = await this.persistListing(platform, product.category, listing, connector.slug);
            if (summary) {
              summary.listingsUpserted += 1;
              summary.priceHistoryEntries += result.priceHistoryCreated ? 1 : 0;
              summary.canonicalProductsCreated += result.createdCanonicalProduct ? 1 : 0;
              summary.canonicalProductsMatched += result.matchedExistingCanonicalProduct ? 1 : 0;
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Cross-store backfill for "${query}" on ${platform.slug} failed: ${message}`,
          );
        }
      }
    }
  }

  /**
   * On-demand, single-product version of backfillCrossStore. Given one canonical
   * product, keep searching the stores that don't yet carry it — using its
   * specific "brand model storage" query — until it's covered by at least
   * `targetStores` distinct stores or every enabled store has been tried.
   *
   * Only stores that actually return a listing WITH A PRICE count toward
   * coverage: retailers surface out-of-stock results with no price, and those are
   * skipped here (matching the persist path elsewhere), so a store is only counted
   * once it's a real price source for this product. The target naturally caps at
   * however many stores are enabled — if only four connectors are live, it stops
   * at four rather than looping forever chasing seven.
   */
  async expandProductStores(
    productId: string,
    targetStoresOverride?: number,
    limitPerQueryOverride?: number,
  ): Promise<void> {
    const enabled = this.configService.get<boolean>('retailers.crossStoreBackfillEnabled', true);
    if (!enabled) {
      return;
    }

    const targetStores = Math.max(
      1,
      targetStoresOverride ?? this.configService.get<number>('retailers.minStoresPerProduct', 7),
    );
    const limitPerQuery = Math.max(
      1,
      limitPerQueryOverride ?? this.configService.get<number>('retailers.crossStoreBackfillLimitPerQuery', 5),
    );

    const product = await this.prisma.canonicalProduct.findUnique({
      where: { id: productId },
      include: {
        category: true,
        sourceListings: { select: { platformId: true, priceUsd: true } },
      },
    });
    if (!product) {
      return;
    }

    // A priceless (out-of-stock) listing doesn't make a store a real price
    // source, so it doesn't count toward coverage.
    const coveringPlatformIds = new Set(
      product.sourceListings
        .filter((listing) => listing.priceUsd != null && Number(listing.priceUsd) > 0)
        .map((listing) => listing.platformId),
    );
    if (coveringPlatformIds.size >= targetStores) {
      return;
    }

    const query = this.buildProductQuery(product);
    if (!query) {
      return;
    }

    const platforms = await this.prisma.platform.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    const missingPlatforms = platforms.filter((platform) => {
      const connector = this.connectorsBySlug.get(platform.slug);
      return connector?.isEnabled && !coveringPlatformIds.has(platform.id);
    });

    for (const platform of missingPlatforms) {
      if (coveringPlatformIds.size >= targetStores) {
        break;
      }
      const connector = this.connectorsBySlug.get(platform.slug);
      if (!connector) {
        continue;
      }

      try {
        const listings = await connector.searchListings(query, limitPerQuery);
        let coveredByThisStore = false;

        for (const listing of listings) {
          if (listing.priceUsd == null || !Number.isFinite(listing.priceUsd) || listing.priceUsd <= 0) {
            continue;
          }

          const result = await this.persistListing(platform, product.category, listing, connector.slug);
          // Only a listing that merged onto THIS product means this store now
          // carries it — a different match is normal ingestion, but not coverage.
          if (result.canonicalProductId === productId) {
            coveredByThisStore = true;
          }
        }

        if (coveredByThisStore) {
          coveringPlatformIds.add(platform.id);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Store expansion for "${query}" on ${platform.slug} failed: ${message}`);
      }
    }
  }

  /**
   * Build a specific search query that identifies one product across stores:
   * brand + model + storage, drawn from the canonical's columns and (as a
   * fallback for older rows) a fresh extraction from its title. Returns null
   * when the product isn't specific enough to search precisely (no brand+model),
   * so we don't fan a vague query out to every store and re-pollute the catalog.
   */
  private buildProductQuery(product: {
    title: string;
    brand: string | null;
    model: string | null;
  }): string | null {
    const extracted = this.normalizer.extractAttributes(product.title);
    const brand = product.brand?.trim() || extracted.brand?.trim() || null;
    const model = product.model?.trim() || extracted.model?.trim() || null;

    if (!brand || !model) {
      return null;
    }

    const parts = [brand, model];
    if (extracted.storage) {
      parts.push(extracted.storage);
    }

    // A model that already begins with the brand (e.g. "Galaxy S26" for
    // Samsung, or a phone model captured as "a6") shouldn't double up awkwardly;
    // dedupe case-insensitively while preserving order.
    const seen = new Set<string>();
    const deduped = parts.filter((part) => {
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return deduped.join(' ');
  }

  private async resolveCategoryForQuery(query: string): Promise<Category | null> {
    const normalizedQuery = query.trim().toLowerCase();
    const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean);

    const categories = await this.prisma.category.findMany({ where: { level: { gt: 0 } } });

    const match = categories.find((category) => {
      const name = category.name.toLowerCase();
      if (name.includes(normalizedQuery) || normalizedQuery.includes(name)) {
        return true;
      }
      return category.searchTerms.some((term) => {
        const normalizedTerm = term.toLowerCase();
        return normalizedQuery.includes(normalizedTerm) || queryTerms.includes(normalizedTerm);
      });
    });

    return match ?? categories[0] ?? null;
  }

  private buildQueriesForCategory(category: Category): string[] {
    const terms = [
      category.name,
      category.slug.replace(/-/g, ' '),
      ...category.searchTerms,
    ]
      .map((term) => term.trim())
      .filter((term) => term.length >= 2);

    return Array.from(new Set(terms)).slice(0, 3);
  }

  private async persistListing(
    platform: Platform,
    category: Category,
    listing: RetailerListing,
    sourceSlug: string,
  ): Promise<{
    createdCanonicalProduct: boolean;
    matchedExistingCanonicalProduct: boolean;
    priceHistoryCreated: boolean;
    canonicalProductId: string;
  }> {
    const normalized = this.normalizer.normalizeTitle(listing.title);
    const extracted = this.normalizer.extractAttributes(listing.title, {
      brand: listing.brand ?? undefined,
      model: listing.model ?? undefined,
      gtin: listing.identifiers.gtin ?? undefined,
      upc: listing.identifiers.upc ?? undefined,
      ean: listing.identifiers.ean ?? undefined,
      mpn: listing.identifiers.mpn ?? undefined,
    });

    // `listing.priceUsd`/`listing.currency` are the raw scraped amount in the
    // store's own currency (the field name is a historical misnomer — see
    // RetailerListing). Converted once here to the base currency (EGP) so the
    // `priceUsd` DB column — used for every cross-store comparison, sort, and
    // merge decision — is genuinely comparable between e.g. a Carrefour AED
    // listing and a 2B EGP listing. `rawPrice`/`rawCurrency` below stay
    // untouched so the store's real, uncoverted price is still shown per-listing.
    const normalizedPrice =
      listing.priceUsd != null ? await this.fxRates.convert(listing.priceUsd, listing.currency) : null;

    const canonicalMatch = await this.findCanonicalMatch(category.id, normalized, extracted, listing);
    const matchedExistingCanonicalProduct = !!canonicalMatch;

    const canonicalProduct =
      canonicalMatch ??
      (await this.createCanonicalProduct(category, listing, normalized, extracted));

    const sourceListing = await this.prisma.sourceListing.upsert({
      where: {
        platformId_externalId: {
          platformId: platform.id,
          externalId: listing.externalId,
        },
      },
      create: {
        platformId: platform.id,
        canonicalProductId: canonicalProduct.id,
        externalId: listing.externalId,
        externalUrl: listing.externalUrl,
        rawTitle: listing.title,
        rawPrice: this.toDbDecimal(listing.priceUsd),
        rawCurrency: listing.currency,
        rawBrand: listing.brand,
        rawImageUrl: listing.imageUrl,
        rawAttributes: this.toJson(this.buildRawAttributes(listing, sourceSlug)),
        rawCategory: category.name,
        normalizedTitle: normalized.normalized,
        extractedGtin: listing.identifiers.gtin,
        extractedUpc: listing.identifiers.upc,
        extractedEan: listing.identifiers.ean,
        extractedMpn: listing.identifiers.mpn,
        extractedBrand: extracted.brand ?? listing.brand,
        extractedModel: extracted.model ?? listing.model,
        extractedAttributes: this.toJson(extracted),
        priceUsd: this.toDbDecimal(normalizedPrice),
        inStock: listing.inStock,
        rating: listing.rating,
        reviewCount: listing.reviewCount,
        matchStatus: MatchStatus.ACCEPTED,
        matchConfidence: matchedExistingCanonicalProduct ? 1 : 0.98,
        matchedAt: new Date(),
        lastSeenAt: new Date(),
        lastScrapedAt: new Date(),
      },
      update: {
        canonicalProductId: canonicalProduct.id,
        externalUrl: listing.externalUrl,
        rawTitle: listing.title,
        rawPrice: this.toDbDecimal(listing.priceUsd),
        rawCurrency: listing.currency,
        rawBrand: listing.brand,
        rawImageUrl: listing.imageUrl,
        rawAttributes: this.toJson(this.buildRawAttributes(listing, sourceSlug)),
        rawCategory: category.name,
        normalizedTitle: normalized.normalized,
        extractedGtin: listing.identifiers.gtin,
        extractedUpc: listing.identifiers.upc,
        extractedEan: listing.identifiers.ean,
        extractedMpn: listing.identifiers.mpn,
        extractedBrand: extracted.brand ?? listing.brand,
        extractedModel: extracted.model ?? listing.model,
        extractedAttributes: this.toJson(extracted),
        priceUsd: this.toDbDecimal(normalizedPrice),
        inStock: listing.inStock,
        rating: listing.rating,
        reviewCount: listing.reviewCount,
        matchStatus: MatchStatus.ACCEPTED,
        matchConfidence: matchedExistingCanonicalProduct ? 1 : 0.98,
        matchedAt: new Date(),
        lastSeenAt: new Date(),
        lastScrapedAt: new Date(),
      },
      include: { canonicalProduct: true },
    });

    const priceHistoryCreated = await this.appendPriceHistory(
      sourceListing.id,
      canonicalProduct.id,
      listing,
      normalizedPrice,
    );

    await this.prisma.matchDecision.create({
      data: {
        sourceListingId: sourceListing.id,
        candidateId: canonicalProduct.id,
        status: MatchStatus.ACCEPTED,
        confidence: matchedExistingCanonicalProduct ? 1 : 0.98,
        engineVersion: `live-ingestion-${sourceSlug}-v1`,
        scores: this.toJson({
          strategy: matchedExistingCanonicalProduct ? 'exact-match' : 'new-canonical-product',
          source: sourceSlug,
        }),
        reasoning: matchedExistingCanonicalProduct
          ? 'Matched by exact identifier or conservative canonical title comparison.'
          : 'Created a new canonical product because no exact-safe match was found.',
        flags: [],
      },
    });

    return {
      createdCanonicalProduct: !canonicalMatch,
      matchedExistingCanonicalProduct,
      priceHistoryCreated,
      canonicalProductId: canonicalProduct.id,
    };
  }

  private async findCanonicalMatch(
    categoryId: string,
    normalized: ReturnType<NormalizerService['normalizeTitle']>,
    extracted: ReturnType<NormalizerService['extractAttributes']>,
    listing: RetailerListing,
  ) {
    const identifierMatch = await this.findByIdentifier(listing.identifiers);
    if (identifierMatch) {
      return identifierMatch;
    }

    const candidates = await this.prisma.canonicalProduct.findMany({
      where: {
        categoryId,
      },
      take: 200,
    });

    const listingBrand = listing.brand?.trim().toLowerCase() ?? extracted.brand?.trim().toLowerCase() ?? null;
    const listingModel = listing.model?.trim().toLowerCase() ?? extracted.model?.trim().toLowerCase() ?? null;
    const listingIsAccessory = this.normalizer.isAccessory(listing.title);

    for (const candidate of candidates) {
      const candidateNormalized = candidate.normalizedTitle.trim().toLowerCase();
      if (candidateNormalized !== normalized.normalized) {
        continue;
      }

      const candidateBrand = candidate.brand?.trim().toLowerCase() ?? null;
      if (candidateBrand && listingBrand && candidateBrand !== listingBrand) {
        continue;
      }

      const candidateModel = candidate.model?.trim().toLowerCase() ?? null;
      if (candidateModel && listingModel && candidateModel !== listingModel) {
        continue;
      }

      if (this.hasIdentifierConflict(listing, candidate)) {
        continue;
      }

      if (this.fuzzyMatcher.detectConditionConflict(listing.title, candidate.title)) {
        continue;
      }

      return candidate;
    }

    // Rank same-category candidates that survive the hard-conflict guards
    // (brand, accessory-vs-product, variant, identifier, storage/RAM/color) by
    // fuzzy text similarity, then ask the local LLM to confirm the closest few,
    // strongest match first.
    //
    // This used to rank candidates by title-embedding similarity instead of
    // fuzzy score. That turned out to actively mislead: nomic-embed-text scored
    // the SAME phone worded differently by two stores at ~0.54 similarity —
    // *lower* than two completely different phone models (~0.53) — while a
    // wrong-color variant of the exact same listing scored a near-perfect ~1.0.
    // Embeddings were essentially blind to the attributes that actually decide
    // a match here and were quietly starving the LLM step of the right
    // candidates. Fuzzy text score (edit distance + token overlap) orders these
    // sanely, and the conflict guards below still do the real precision work.
    const survivors: Array<{ candidate: (typeof candidates)[number]; score: number }> = [];

    for (const candidate of candidates) {
      const candidateBrand = candidate.brand?.trim().toLowerCase() ?? null;
      if (candidateBrand && listingBrand && candidateBrand !== listingBrand) {
        continue;
      }

      // An accessory's title routinely *names* the product it's compatible with
      // ("Case for Samsung Galaxy S26 Ultra") — that would otherwise satisfy the
      // brand/model/title checks below and merge a phone case into the phone.
      if (listingIsAccessory !== this.normalizer.isAccessory(candidate.title)) {
        continue;
      }

      if (this.fuzzyMatcher.detectVariantConflict(listing.title, candidate.title)) {
        continue;
      }

      if (this.fuzzyMatcher.detectModelCodeSuffixConflict(listing.title, candidate.title)) {
        continue;
      }

      if (this.fuzzyMatcher.detectDisjointModelConflict(listing.title, candidate.title)) {
        continue;
      }

      if (this.hasIdentifierConflict(listing, candidate)) {
        continue;
      }

      if (this.fuzzyMatcher.detectConditionConflict(listing.title, candidate.title)) {
        continue;
      }

      // Recomputed fresh from the candidate's title rather than trusting its
      // stored `attributes` column, which can be stale or never populated for
      // older/previously-merged rows (a real false merge this caused: a
      // "Cobalt Violet" listing merged with a "Black" canonical because the
      // stored attributes had no color at all, even though it's extractable
      // straight from the title).
      const candidateExtracted = this.normalizer.extractAttributes(candidate.title);
      if (
        this.fuzzyMatcher.detectStorageConflict(extracted.storage ?? undefined, candidateExtracted.storage) ||
        this.fuzzyMatcher.detectRamConflict(extracted.ram ?? undefined, candidateExtracted.ram) ||
        this.fuzzyMatcher.detectColorConflict(extracted.color ?? undefined, candidateExtracted.color) ||
        this.fuzzyMatcher.detectDisplaySizeConflict(extracted.displaySize ?? undefined, candidateExtracted.displaySize)
      ) {
        continue;
      }

      const candidateTitle = this.normalizer.normalizeTitle(candidate.title);
      const titleScore = this.fuzzyMatcher.combinedScore(
        normalized.normalized,
        normalized.tokens,
        candidateTitle.normalized,
        candidateTitle.tokens,
      );

      // Retailers pad titles wildly differently ("Samsung Galaxy S26 - 256GB - Sky
      // Blue" vs "Samsung Galaxy S26, Unlocked Android Smartphone... Galaxy AI...
      // Sky Blue"), which tanks raw title token-overlap even for the exact same SKU.
      // If brand, model number, storage, RAM and color all agree (and none of the
      // conflict guards above rejected the pair), that structured agreement is
      // stronger evidence of a true match than the noisy title text is — boost it
      // to the front of the LLM confirmation queue without short-circuiting the
      // LLM check itself.
      // Falls back to a fresh extraction for the same reason as above: older
      // canonical rows predate model extraction for several phone brands, so
      // the stored `model` column is often empty even though it's derivable
      // from the title right now.
      const candidateModel = candidate.model?.trim().toLowerCase() ?? candidateExtracted.model?.trim().toLowerCase() ?? null;
      const modelsAgree = !!candidateModel && !!listingModel && candidateModel === listingModel;
      const score = modelsAgree ? Math.max(titleScore, MODEL_AGREEMENT_SCORE) : titleScore;

      survivors.push({ candidate, score });
    }

    survivors.sort((a, b) => b.score - a.score);
    const topCandidates = survivors.slice(0, 8);

    // A survivor already scoring >= the "models agree" boost has cleared every
    // hard-conflict guard above (brand, accessory, variant, model-code-suffix,
    // disjoint-model-code, identifier, storage/RAM/color/display) AND has an
    // extracted model number that exactly matches the listing's. That's a
    // stronger, more reliable signal than the small local LLM: testing showed
    // qwen2.5:1.5b incorrectly rejects real duplicates worded differently by
    // two stores (e.g. "Oppo A6 - 8GB RAM - 256GB" vs "OPPO A6 Smartphone,
    // 256 GB, ... 8 GB RAM") even though every structured attribute agrees.
    // Skip the unreliable judge call entirely for these and accept directly.
    if (topCandidates.length > 0 && topCandidates[0].score >= MODEL_AGREEMENT_SCORE) {
      return topCandidates[0].candidate;
    }

    let llmUnavailable = false;
    for (const { candidate } of topCandidates) {
      const verdict = await this.semantic.judgeSameProduct(listing.title, candidate.title);
      if (verdict === true) {
        return candidate;
      }
      if (verdict === null) {
        // OpenRouter is unreachable/unconfigured — stop asking (every
        // remaining call would fail the same way) and fall back below.
        llmUnavailable = true;
        break;
      }
    }

    // LLM couldn't be reached for any candidate — fall back to the plain fuzzy
    // score threshold so ingestion doesn't stall or silently stop matching.
    if (llmUnavailable && survivors.length > 0 && survivors[0].score >= FUZZY_MATCH_THRESHOLD) {
      return survivors[0].candidate;
    }

    return null;
  }

  /**
   * Same store, near-identical titles, different SKUs (e.g. ELARABY's many
   * "Remote Control TORNADO LED TV Black" remotes) must never merge: when both
   * sides carry the same kind of identifier and the values differ, they are
   * different products no matter how similar the titles look.
   */
  private hasIdentifierConflict(
    listing: RetailerListing,
    candidate: { gtin: string | null; upc: string | null; ean: string | null; mpn: string | null },
  ): boolean {
    const pairs: Array<[string | null | undefined, string | null]> = [
      [listing.identifiers.gtin, candidate.gtin],
      [listing.identifiers.upc, candidate.upc],
      [listing.identifiers.ean, candidate.ean],
      [listing.identifiers.mpn, candidate.mpn],
    ];

    return pairs.some(
      ([listingId, candidateId]) =>
        !!listingId && !!candidateId && listingId.trim().toLowerCase() !== candidateId.trim().toLowerCase(),
    );
  }

  private async findByIdentifier(identifiers: RetailerListing['identifiers']) {
    const clauses: Array<Record<string, string>> = [];
    if (identifiers.gtin) clauses.push({ gtin: identifiers.gtin });
    if (identifiers.upc) clauses.push({ upc: identifiers.upc });
    if (identifiers.ean) clauses.push({ ean: identifiers.ean });
    if (identifiers.mpn) clauses.push({ mpn: identifiers.mpn });

    if (clauses.length === 0) {
      return null;
    }

    return this.prisma.canonicalProduct.findFirst({
      where: {
        OR: clauses,
      },
    });
  }

  private async createCanonicalProduct(
    category: Category,
    listing: RetailerListing,
    normalized: ReturnType<NormalizerService['normalizeTitle']>,
    extracted: ReturnType<NormalizerService['extractAttributes']>,
  ) {
    const baseSlug = this.toSlug(
      [listing.brand ?? extracted.brand, listing.model ?? extracted.model, listing.title]
        .filter(Boolean)
        .join(' '),
    );
    const slug = await this.ensureUniqueSlug(baseSlug || `product-${listing.externalId}`);

    const price = listing.priceUsd ?? null;

    const product = await this.prisma.canonicalProduct.create({
      data: {
        categoryId: category.id,
        slug,
        title: listing.title,
        normalizedTitle: normalized.normalized,
        brand: listing.brand ?? extracted.brand ?? null,
        model: listing.model ?? extracted.model ?? null,
        gtin: listing.identifiers.gtin ?? null,
        upc: listing.identifiers.upc ?? null,
        ean: listing.identifiers.ean ?? null,
        mpn: listing.identifiers.mpn ?? null,
        attributes: this.toJson(extracted),
        imageUrl: listing.imageUrl ?? null,
        thumbnailUrl: listing.imageUrl ?? null,
        tier: this.inferTier(price),
        isVerified: false,
      },
    });

    return product;
  }

  private async ensureUniqueSlug(baseSlug: string): Promise<string> {
    let slug = baseSlug;
    let suffix = 1;

    while (await this.prisma.canonicalProduct.findUnique({ where: { slug } })) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    return slug;
  }

  private async appendPriceHistory(
    sourceListingId: string,
    canonicalProductId: string,
    listing: RetailerListing,
    normalizedPrice: number | null,
  ): Promise<boolean> {
    if (normalizedPrice == null) {
      return false;
    }

    const lastEntry = await this.prisma.priceHistory.findFirst({
      where: {
        sourceListingId,
      },
      orderBy: { recordedAt: 'desc' },
    });

    const currentPrice = this.toDbDecimal(normalizedPrice);
    if (!currentPrice) {
      return false;
    }

    if (lastEntry && Number(lastEntry.priceUsd) === Number(currentPrice)) {
      return false;
    }

    // `priceUsd`/`currency` here are the normalized, base-currency values so
    // the price-history chart can aggregate across stores in different
    // currencies (see products.service.ts getPriceHistory). `originalPrice`
    // keeps the store's raw, unconverted price for reference.
    await this.prisma.priceHistory.create({
      data: {
        canonicalProductId,
        sourceListingId,
        priceUsd: currentPrice,
        currency: this.fxRates.base,
        originalPrice: this.toDbDecimal(listing.priceUsd),
        inStock: listing.inStock ?? true,
      },
    });

    return true;
  }

  private inferTier(priceUsd: number | null): ProductTier {
    if (priceUsd == null) return ProductTier.MID_RANGE;
    if (priceUsd < 300) return ProductTier.BUDGET;
    if (priceUsd < 900) return ProductTier.MID_RANGE;
    if (priceUsd < 1800) return ProductTier.PREMIUM;
    return ProductTier.ULTRA_PREMIUM;
  }

  private buildRawAttributes(listing: RetailerListing, source: string): Record<string, unknown> {
    return {
      source,
      brand: listing.brand,
      model: listing.model,
      identifiers: listing.identifiers,
      imageUrl: listing.imageUrl,
      inStock: listing.inStock,
      rating: listing.rating,
      reviewCount: listing.reviewCount,
      raw: listing.raw,
    };
  }

  private toDbDecimal(value: number | null): string | null {
    if (value == null || !Number.isFinite(value)) {
      return null;
    }

    return value.toFixed(2);
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  private toSlug(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }
}
