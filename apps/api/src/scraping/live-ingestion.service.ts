import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus, ProductTier, Prisma, ScrapingJobStatus, Platform, Category } from '@prisma/client';
import type { CanonicalProduct } from '@prisma/client';
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
import {
  CANDIDATE_POOL_SIZE,
  CATEGORY_MEDIAN_TTL_MS,
  CandidateSource,
  MATCHED_CONFIDENCE,
  MIN_LISTINGS_FOR_CATEGORY_FLOOR,
  MatchingTools,
  NEW_PRODUCT_CONFIDENCE,
  checkCategorySanity,
  checkMarketOutlier,
  detectJunkListing,
  findCanonicalMatch,
  hasUsablePrice,
  identifierLookupClauses,
  normalizeListing,
  toBasePrices,
} from '../matching/pipeline';

const ACCEPTED_STATUSES: MatchStatus[] = [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT];

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
  private readonly tools: MatchingTools;

  /** Guards against two scheduled coverage sweeps overlapping. */
  private coverageSweepInFlight = false;

  /**
   * Consecutive-failure tally per connector slug, and the time its circuit
   * re-opens. In memory on purpose: a restart is a reasonable moment to give a
   * struggling store another chance, and this only needs to hold for the length
   * of a sweep.
   */
  private readonly connectorFailures = new Map<string, number>();
  private readonly connectorCooldownUntil = new Map<string, number>();

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
    this.tools = { normalizer: this.normalizer, fuzzy: this.fuzzyMatcher };
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

            // Step 1: price gate.
            if (!hasUsablePrice(listing.priceUsd)) {
              this.logger.warn(
                `Skipping listing "${listing.title}" from ${connector.slug} — no usable price (likely a scrape error, not a real product)`,
              );
              continue;
            }

            summary.listingsDiscovered += 1;

            const result = await this.persistListing(platform, category, listing, connector.slug);
            if (!result) {
              continue;
            }
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
            if (!hasUsablePrice(listing.priceUsd)) {
              continue;
            }

            const result = await this.persistListing(platform, product.category, listing, connector.slug);
            if (!result) {
              continue;
            }
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
      if (this.isConnectorInCooldown(platform.slug)) {
        continue;
      }

      try {
        const listings = await connector.searchListings(query, limitPerQuery);
        // A connector that returns nothing at all is the signal we can act on:
        // the blocked paths (CAPTCHA wall, bot shell, changed markup) log and
        // return an empty array rather than throwing, so counting only
        // exceptions would never trip the breaker on exactly the stores that
        // are costing the most and returning the least. Any non-empty result
        // means the connector is working, even if nothing merges onto this
        // product -- a store simply not carrying an item is not a failure.
        if (listings.length === 0) {
          this.recordConnectorFailure(platform.slug, 'returned no listings');
        } else {
          this.recordConnectorSuccess(platform.slug);
        }
        let coveredByThisStore = false;

        for (const listing of listings) {
          if (!hasUsablePrice(listing.priceUsd)) {
            continue;
          }

          const result = await this.persistListing(platform, product.category, listing, connector.slug);
          // Only a listing that merged onto THIS product means this store now
          // carries it — a different match is normal ingestion, but not coverage.
          if (result?.canonicalProductId === productId) {
            coveredByThisStore = true;
          }
        }

        if (coveredByThisStore) {
          coveringPlatformIds.add(platform.id);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.recordConnectorFailure(platform.slug, message);
        this.logger.warn(`Store expansion for "${query}" on ${platform.slug} failed: ${message}`);
      }
    }
  }

  /**
   * True while a connector's circuit is open. Each attempt against a blocked
   * store costs a full real-browser page load and yields nothing, so once a
   * store has failed repeatedly it is left alone for a cooldown rather than
   * retried once per product for the whole batch.
   */
  private isConnectorInCooldown(slug: string): boolean {
    const until = this.connectorCooldownUntil.get(slug);
    if (until == null) {
      return false;
    }
    if (Date.now() >= until) {
      // Cooldown served -- let the next attempt through and judge it fresh.
      this.connectorCooldownUntil.delete(slug);
      this.connectorFailures.set(slug, 0);
      return false;
    }
    return true;
  }

  private recordConnectorFailure(slug: string, reason: string): void {
    const threshold = Math.max(
      1,
      this.configService.get<number>('retailers.connectorFailureThreshold', 5),
    );
    const cooldownMinutes = Math.max(
      1,
      this.configService.get<number>('retailers.connectorCooldownMinutes', 30),
    );

    const failures = (this.connectorFailures.get(slug) ?? 0) + 1;
    this.connectorFailures.set(slug, failures);

    if (failures >= threshold && !this.connectorCooldownUntil.has(slug)) {
      this.connectorCooldownUntil.set(slug, Date.now() + cooldownMinutes * 60 * 1000);
      this.logger.warn(
        `Connector "${slug}" failed ${failures} times in a row (last: ${reason}) -- ` +
          `pausing it for ${cooldownMinutes}m.`,
      );
    }
  }

  private recordConnectorSuccess(slug: string): void {
    this.connectorFailures.set(slug, 0);
  }

  /**
   * Catalog-wide counterpart to expandProductStores: the reactive triggers (product
   * detail view, search hit) only reach products someone actually browses to, so a
   * product nobody has looked at recently can sit under-covered indefinitely. This
   * runs on a cron, scans for canonical products below minStoresPerProduct, and
   * expands the worst-covered ones first -- bounded per run by
   * storeCoverageSweepBatchSize so one sweep doesn't try to fix the whole catalog
   * (and every store it scrapes) in a single pass.
   */
  async runStoreCoverageSweep(maxProductsOverride?: number): Promise<{ scanned: number; expanded: number }> {
    const enabled = this.configService.get<boolean>('retailers.storeCoverageSweepEnabled', true);
    if (!enabled) {
      return { scanned: 0, expanded: 0 };
    }

    // A sweep can outlast its own cron interval on a slow day. Bull will happily
    // start the next occurrence anyway, and two concurrent sweeps compete for
    // the same shared browser contexts, so the run time degrades further each
    // time one piles up. Skip rather than queue: the next tick will pick up
    // wherever this run left off, because progress is persisted per product.
    if (this.coverageSweepInFlight) {
      this.logger.warn('Store coverage sweep is already running -- skipping this occurrence');
      return { scanned: 0, expanded: 0 };
    }
    this.coverageSweepInFlight = true;

    try {
      const minStores = await this.resolveCoverageTarget();
      const maxProducts = Math.max(
        1,
        maxProductsOverride ?? this.configService.get<number>('retailers.storeCoverageSweepBatchSize', 100),
      );
      const cooldownHours = Math.max(
        0,
        this.configService.get<number>('retailers.storeCoverageRetryCooldownHours', 168),
      );
      const cooldownCutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);

      // Products are eligible when they are below the (reachable) target AND we
      // have not already spent scraping effort on them inside the cooldown
      // window. Without the second condition a product no other store carries
      // is re-scraped on every run for as long as it exists -- which is what
      // pinned this box at 100% CPU: the target was unreachable, so the
      // candidate set was the entire catalog, permanently.
      const underCovered = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT cp.id
        FROM canonical_products cp
        JOIN source_listings sl
          ON sl.canonical_product_id = cp.id
          AND sl.price_usd IS NOT NULL AND sl.price_usd > 0 AND sl.in_stock IS NOT FALSE
        WHERE cp.last_coverage_attempt_at IS NULL
           OR cp.last_coverage_attempt_at < ${cooldownCutoff}
        GROUP BY cp.id
        HAVING COUNT(DISTINCT sl.platform_id) < ${minStores}
        ORDER BY COUNT(DISTINCT sl.platform_id) ASC, cp.last_coverage_attempt_at ASC NULLS FIRST
        LIMIT ${maxProducts}
      `);

      let expanded = 0;
      for (const { id } of underCovered) {
        try {
          await this.expandProductStores(id, minStores);
          expanded += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Store coverage sweep failed for product ${id}: ${message}`);
        } finally {
          // Stamped whether or not the expansion found anything, and whether or
          // not it threw. The stamp records that effort was spent here, which
          // is what the cooldown is about -- recording only successes would let
          // the products that always fail come straight back next run.
          await this.markCoverageAttempt(id);
        }
      }

      this.logger.log(
        `Store coverage sweep: scanned ${underCovered.length}, expanded ${expanded} ` +
          `(target ${minStores} stores, ${cooldownHours}h retry cooldown)`,
      );
      return { scanned: underCovered.length, expanded };
    } finally {
      this.coverageSweepInFlight = false;
    }
  }

  /**
   * The configured store target clamped to what is actually achievable: a
   * product can never be covered by more stores than there are enabled
   * connectors for active platforms. Asking for more than that makes the
   * sweep's exit condition unsatisfiable rather than ambitious.
   */
  private async resolveCoverageTarget(): Promise<number> {
    const configured = Math.max(1, this.configService.get<number>('retailers.minStoresPerProduct', 4));
    const activePlatforms = await this.prisma.platform.findMany({
      where: { isActive: true },
      select: { slug: true },
    });
    const reachable = activePlatforms.filter(
      (platform) => this.connectorsBySlug.get(platform.slug)?.isEnabled,
    ).length;

    if (reachable > 0 && configured > reachable) {
      this.logger.warn(
        `minStoresPerProduct is ${configured} but only ${reachable} connector(s) are enabled ` +
          `for active platforms -- clamping the coverage target to ${reachable}.`,
      );
      return reachable;
    }
    return configured;
  }

  private async markCoverageAttempt(productId: string): Promise<void> {
    try {
      await this.prisma.canonicalProduct.update({
        where: { id: productId },
        data: { lastCoverageAttemptAt: new Date() },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not record coverage attempt for product ${productId}: ${message}`);
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
  } | null> {
    // Step 2: junk filter.
    const junk = detectJunkListing(listing.title);
    if (junk) {
      await this.rejectListing(platform, listing, junk);
      return null;
    }

    // Step 3: normalize and extract.
    const input = normalizeListing(listing, this.tools);
    const { normalized, extracted } = input;

    // Step 4: currency. `rawPrice`/`rawCurrency` below keep the store's own amount.
    const { price: normalizedPrice, advertisedPrice } = await toBasePrices(listing, (amount, currency) =>
      this.fxRates.convert(amount, currency),
    );

    // Step 5: category sanity.
    if (normalizedPrice != null) {
      const categoryMedian = await this.categoryMedianPrice(category.id);
      const insane = checkCategorySanity(
        { title: listing.title, price: normalizedPrice, categoryName: category.name, categoryMedian },
        this.tools,
      );
      if (insane) {
        await this.rejectListing(platform, listing, insane);
        return null;
      }
    }

    // Steps 6-9: find the product it belongs to.
    const canonicalMatch = await findCanonicalMatch(
      input,
      category.id,
      { candidates: this.candidateSource, judge: this.semantic },
      this.tools,
    );

    // Step 10: market outlier. Such a listing is not attached to the product,
    // and not turned into a product of its own either: its title says it is
    // this product, so a new canonical would just duplicate it with a bad price.
    if (canonicalMatch && normalizedPrice != null) {
      const others = await this.prisma.sourceListing.findMany({
        where: {
          canonicalProductId: canonicalMatch.id,
          matchStatus: { in: ACCEPTED_STATUSES },
          priceUsd: { not: null },
          NOT: { platformId: platform.id, externalId: listing.externalId },
        },
        select: { priceUsd: true, platformId: true },
      });
      const { outlier, median } = checkMarketOutlier(
        { price: normalizedPrice, store: platform.id },
        others.map((other) => ({ price: Number(other.priceUsd), store: other.platformId })),
      );
      if (outlier) {
        await this.rejectListing(
          platform,
          listing,
          `price ${normalizedPrice} is far from the ${median} median of "${canonicalMatch.title}"`,
        );
        return null;
      }
    }

    const matchedExistingCanonicalProduct = !!canonicalMatch;
    const confidence = matchedExistingCanonicalProduct ? MATCHED_CONFIDENCE : NEW_PRODUCT_CONFIDENCE;

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
        advertisedPrice: this.toDbDecimal(advertisedPrice),
        inStock: listing.inStock,
        rating: listing.rating,
        reviewCount: listing.reviewCount,
        matchStatus: MatchStatus.ACCEPTED,
        matchConfidence: confidence,
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
        advertisedPrice: this.toDbDecimal(advertisedPrice),
        inStock: listing.inStock,
        rating: listing.rating,
        reviewCount: listing.reviewCount,
        matchStatus: MatchStatus.ACCEPTED,
        matchConfidence: confidence,
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
        confidence,
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

  private readonly categoryMedians = new Map<string, { median: number | null; at: number }>();

  /**
   * Median accepted price in a category, cached for an hour; null while the
   * category has too few listings for its median to mean anything.
   */
  private async categoryMedianPrice(categoryId: string): Promise<number | null> {
    const cached = this.categoryMedians.get(categoryId);
    if (cached && Date.now() - cached.at < CATEGORY_MEDIAN_TTL_MS) return cached.median;

    const [row] = await this.prisma.$queryRaw<Array<{ median: number | null; n: bigint }>>(Prisma.sql`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY sl.price_usd)::float AS median, COUNT(*) AS n
      FROM source_listings sl
      JOIN canonical_products cp ON cp.id = sl.canonical_product_id
      WHERE cp.category_id = ${categoryId}
        AND sl.match_status IN ('ACCEPTED', 'MANUAL_ACCEPT')
        AND sl.price_usd > 0
    `);
    const median = row && Number(row.n) >= MIN_LISTINGS_FOR_CATEGORY_FLOOR ? row.median : null;
    this.categoryMedians.set(categoryId, { median, at: Date.now() });
    return median;
  }

  /**
   * Drops a listing ingestion refuses to attach. One stored by an earlier run
   * is marked REJECTED rather than left in place: the upsert below re-accepts
   * every listing it sees, so without this a listing that only fails the check
   * now would keep its old ACCEPTED match and keep being shown.
   */
  private async rejectListing(platform: Platform, listing: RetailerListing, reason: string): Promise<void> {
    const { count } = await this.prisma.sourceListing.updateMany({
      where: {
        platformId: platform.id,
        externalId: listing.externalId,
        matchStatus: { in: [MatchStatus.ACCEPTED, MatchStatus.PENDING] },
      },
      data: { matchStatus: MatchStatus.REJECTED, lastSeenAt: new Date(), lastScrapedAt: new Date() },
    });
    this.logger.log(
      `Rejected "${listing.title}" from ${platform.slug}: ${reason}${count ? ' (was previously accepted)' : ''}`,
    );
  }

  /** Step 6-9 candidate lookup, over Prisma. */
  private readonly candidateSource: CandidateSource<CanonicalProduct> = {
    findByIdentifier: async (identifiers) => {
      const clauses = identifierLookupClauses(identifiers);
      if (clauses.length === 0) {
        return null;
      }
      return this.prisma.canonicalProduct.findFirst({ where: { OR: clauses } });
    },
    findInCategory: (categoryId) =>
      this.prisma.canonicalProduct.findMany({ where: { categoryId }, take: CANDIDATE_POOL_SIZE }),
  };

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
