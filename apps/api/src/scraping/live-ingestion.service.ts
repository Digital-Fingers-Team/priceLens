import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Category, Platform } from '@prisma/client';
import { NormalizerService } from '../matching/normalizer.service';
import { hasUsablePrice } from '../matching/pipeline';
import { ConnectorRegistry } from './connectors/connector.registry';
import type { RetailerConnector } from './interfaces/retailer-connector.interface';
import { IngestionRepository } from './ingestion/ingestion.repository';
import { ListingProcessor } from './ingestion/listing-processor.service';
import { StoreCallGuard, StoreUnavailableError } from './ingestion/store-call-guard';
import { buildProductQuery, buildQueriesForCategory, pickCategoryForQuery } from './ingestion/search-queries';
import { selectSweepCategories } from './ingestion/sweep-selection';

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
  /** Queries that failed even after a retry; the run moved on to the next one. */
  queriesFailed: number;
  /** Listings that failed to process; the run moved on to the next one. */
  listingsFailed: number;
  /**
   * Listings dropped by the price floor (step 4b). Approximate when two jobs
   * scrape the same store at once: the processor counts per store, not per job.
   */
  listingsBelowFloor: number;
  /** The same, per category slug. */
  listingsBelowFloorByCategory: Record<string, number>;
}

export interface IngestionReport {
  startedAt: string;
  finishedAt: string;
  platforms: IngestionSummary[];
  skippedPlatforms: Array<{ slug: string; reason: string }>;
}

/**
 * Scrape runs: the scheduled category sweep over every store, and the
 * on-demand run for one search term. Each listing found goes through
 * ListingProcessor (matching pipeline + persistence). After a run, the
 * products it touched are re-searched on the other stores (cross-store
 * backfill), so one product can show several stores instead of one.
 */
@Injectable()
export class LiveIngestionService {
  private readonly logger = new Logger(LiveIngestionService.name);

  constructor(
    private readonly repository: IngestionRepository,
    private readonly processor: ListingProcessor,
    private readonly connectors: ConnectorRegistry,
    private readonly normalizer: NormalizerService,
    private readonly configService: ConfigService,
    private readonly storeCalls: StoreCallGuard,
  ) {}

  async runLiveIngestion(options: LiveIngestionOptions = {}): Promise<IngestionReport> {
    const startedAt = new Date();
    const requestedPlatforms = this.requestedPlatforms(options);
    const limitPerQuery = this.limitPerQuery(options);

    const platforms = await this.repository.findActivePlatforms(requestedPlatforms);
    const skippedPlatforms = this.unavailablePlatforms(requestedPlatforms, platforms);
    const summaries: IngestionSummary[] = [];
    // Products created/touched by the sweep. The cross-store backfill
    // re-queries the other stores for exactly these.
    const touchedProductIds = new Set<string>();

    // Chosen once per run, so every store sweeps the same categories and the
    // rotation advances once.
    const categories = await this.sweepCategories();
    const categoryQueries = categories.map((category) => ({
      category,
      queries: buildQueriesForCategory(category),
    }));

    for (const platform of platforms) {
      const connector = this.usableConnector(platform, skippedPlatforms);
      if (!connector) {
        continue;
      }

      try {
        summaries.push(
          await this.runIngestionJob(
            platform,
            connector,
            limitPerQuery,
            categoryQueries,
            { categoryCount: categories.length },
            touchedProductIds,
            { emptyIsFailure: true },
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        skippedPlatforms.push({ slug: platform.slug, reason: `ingestion_failed:${message}` });
      }
    }

    // Marked even when stores returned nothing, so an empty category moves to
    // the back of the rotation instead of being retried every run -- but only
    // when at least one store was actually swept.
    if (summaries.length > 0) {
      await this.repository.markCategoriesSwept(
        categories.filter((category) => category.rolloutWave > 0).map((category) => category.id),
        new Date(),
      );
    }

    await this.backfillCrossStore(platforms, touchedProductIds, summaries);

    return {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      platforms: summaries,
      skippedPlatforms,
    };
  }

  /**
   * The leaves this scheduled sweep covers: wave 0 always, plus the least
   * recently swept of the enabled waves (see selectSweepCategories).
   */
  /**
   * One broad search (STORE_PROBE_QUERY, "samsung" by default: every store
   * we scrape sells Samsung). True when the store answered with listings. An
   * empty probe counts as a failure; a paused store rethrows.
   */
  private async probeStore(connector: RetailerConnector): Promise<boolean> {
    const probe = this.configService.get<string>('retailers.storeProbeQuery', 'samsung');
    try {
      const listings = await this.storeCalls.search(connector, probe, 1, { emptyIsFailure: true });
      return listings.length > 0;
    } catch (error) {
      if (error instanceof StoreUnavailableError) throw error;
      return false;
    }
  }

  private recordBelowFloor(summary: IngestionSummary, platformSlug: string): void {
    const { total, byCategory } = this.processor.takeBelowFloor(platformSlug);
    summary.listingsBelowFloor = total;
    summary.listingsBelowFloorByCategory = byCategory;
  }

  /** Wave 0 always; waves 1..CATEGORY_SWEEP_MAX_WAVE when enabled; negative waves (retired) never. */
  private isWaveLive(category: Pick<Category, 'rolloutWave'>): boolean {
    const wave = category.rolloutWave ?? 0;
    return wave >= 0 && wave <= this.configService.get<number>('retailers.categorySweepMaxWave', 0);
  }

  async sweepCategories(): Promise<Category[]> {
    return selectSweepCategories(await this.repository.findLeafCategories(), {
      maxWave: this.configService.get<number>('retailers.categorySweepMaxWave', 0),
      maxNewPerRun: this.configService.get<number>('retailers.maxCategorySweepsPerRun', 15),
    });
  }

  /**
   * Ingests listings for a single ad hoc search term (what the user actually
   * typed) against one resolved category, instead of sweeping every
   * category's canned queries.
   */
  async runQueryIngestion(query: string, options: LiveIngestionOptions = {}): Promise<IngestionReport> {
    const startedAt = new Date();
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return { startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), platforms: [], skippedPlatforms: [] };
    }

    const requestedPlatforms = this.requestedPlatforms(options);
    const limitPerQuery = this.limitPerQuery(options);

    const platforms = await this.repository.findActivePlatforms(requestedPlatforms);
    const skippedPlatforms = this.unavailablePlatforms(requestedPlatforms, platforms);
    const summaries: IngestionSummary[] = [];
    // A search for "iphone 16" typically returns a different color/storage
    // mix per store; the backfill below re-searches the OTHER stores for the
    // specific variants found here so they merge onto the same product.
    const touchedProductIds = new Set<string>();

    // A term match first; otherwise the leaf the catalogue already files such
    // products under. Neither: the query is not scraped (no_matching_category).
    // Only categories whose wave is live count, so a wave that is off (or
    // turned back off) gets no products from searches either.
    const live = (await this.repository.findLeafCategories()).filter((leaf) => this.isWaveLive(leaf));
    const fallback = async () => {
      const found = await this.repository.dominantLeafCategoryForQuery(trimmedQuery);
      return found && this.isWaveLive(found) ? found : null;
    };
    const category = pickCategoryForQuery(trimmedQuery, live) ?? (await fallback());

    for (const platform of platforms) {
      const connector = this.usableConnector(platform, skippedPlatforms);
      if (!connector) {
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
            { emptyIsFailure: false },
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        skippedPlatforms.push({ slug: platform.slug, reason: `ingestion_failed:${message}` });
      }
    }

    // The scheduled sweep's default cap (40 products) suits a background job;
    // an on-demand search needs to finish in reasonable time, so cap tighter.
    await this.backfillCrossStore(platforms, touchedProductIds, summaries, 8);

    return {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      platforms: summaries,
      skippedPlatforms,
    };
  }

  private requestedPlatforms(options: LiveIngestionOptions): string[] {
    return options.platformSlugs?.length
      ? options.platformSlugs.map((slug) => slug.toLowerCase())
      : this.connectors.slugs();
  }

  private limitPerQuery(options: LiveIngestionOptions): number {
    return Math.max(1, options.limitPerQuery ?? this.configService.get<number>('retailers.liveIngestionLimit', 25));
  }

  /** Requested slugs that have no connector, or no active platform row. */
  private unavailablePlatforms(requested: string[], platforms: Platform[]): Array<{ slug: string; reason: string }> {
    const foundSlugs = new Set(platforms.map((platform) => platform.slug));
    const skipped: Array<{ slug: string; reason: string }> = [];
    for (const slug of requested) {
      if (!this.connectors.has(slug)) {
        skipped.push({ slug, reason: 'unsupported_platform' });
      } else if (!foundSlugs.has(slug)) {
        skipped.push({ slug, reason: 'platform_not_found_or_inactive' });
      }
    }
    return skipped;
  }

  /** The platform's connector when it exists and is enabled; otherwise records why not. */
  private usableConnector(
    platform: Platform,
    skipped: Array<{ slug: string; reason: string }>,
  ): RetailerConnector | null {
    const connector = this.connectors.get(platform.slug);
    if (!connector) {
      skipped.push({ slug: platform.slug, reason: 'connector_not_implemented' });
      return null;
    }
    if (!connector.isEnabled) {
      skipped.push({ slug: platform.slug, reason: 'connector_disabled' });
      return null;
    }
    if (this.storeCalls.isPaused(platform.slug)) {
      skipped.push({ slug: platform.slug, reason: 'circuit_open' });
      return null;
    }
    return connector;
  }

  private async runIngestionJob(
    platform: Platform,
    connector: RetailerConnector,
    limitPerQuery: number,
    categoryQueries: Array<{ category: Category; queries: string[] }>,
    extraPayload: Record<string, unknown> = {},
    touchedProductIds?: Set<string>,
    searchOptions: { emptyIsFailure: boolean } = { emptyIsFailure: false },
  ): Promise<IngestionSummary> {
    const jobId = await this.repository.startJob(platform.id, {
      connector: connector.slug,
      limitPerQuery,
      ...extraPayload,
    });

    const summary: IngestionSummary = {
      platformSlug: platform.slug,
      platformName: platform.name,
      jobId,
      queriesRun: 0,
      listingsDiscovered: 0,
      listingsUpserted: 0,
      canonicalProductsCreated: 0,
      canonicalProductsMatched: 0,
      priceHistoryEntries: 0,
      queriesFailed: 0,
      listingsFailed: 0,
      listingsBelowFloor: 0,
      listingsBelowFloorByCategory: {},
    };

    const seenExternalIds = new Set<string>();
    this.processor.takeBelowFloor(platform.slug);

    try {
      // A sweep counts empty answers as failures because a blocked connector
      // returns [] instead of throwing. But a store that answers a broad probe
      // is not blocked: its empty answers only mean it does not sell that
      // category (Elaraby has no CPUs), and must not pause it.
      const storeAnswers = searchOptions.emptyIsFailure ? await this.probeStore(connector) : false;

      for (const { category, queries } of categoryQueries) {
        for (const query of queries) {
          summary.queriesRun += 1;

          // One failed query no longer ends the store's whole run (B-07): it
          // is retried once, then skipped. Only a paused store (circuit
          // open) stops the run, by throwing out of the loop.
          let listings;
          try {
            // An empty answer for an original (wave 0) category means the
            // store is broken; for a new-wave category it usually means the
            // store just doesn't sell it, and must not trip the circuit
            // breaker (which pauses the store for users too).
            listings = await this.storeCalls.search(connector, query, limitPerQuery, {
              ...searchOptions,
              emptyIsFailure: searchOptions.emptyIsFailure && !storeAnswers && (category.rolloutWave ?? 0) === 0,
            });
          } catch (error) {
            if (error instanceof StoreUnavailableError) throw error;
            summary.queriesFailed += 1;
            this.logger.warn(`${connector.slug} query "${query}" failed: ${(error as Error).message}`);
            continue;
          }

          for (const listing of listings) {
            if (seenExternalIds.has(listing.externalId)) {
              continue;
            }
            seenExternalIds.add(listing.externalId);

            // Pipeline step 1: price gate.
            if (!hasUsablePrice(listing.priceUsd)) {
              this.logger.warn(
                `Skipping listing "${listing.title}" from ${connector.slug} — no usable price (likely a scrape error, not a real product)`,
              );
              await this.processor.recordUnpriced(platform, listing);
              continue;
            }

            summary.listingsDiscovered += 1;

            let result;
            try {
              result = await this.processor.process(platform, category, listing, connector.slug);
            } catch (error) {
              // One bad listing (a constraint, a malformed field) must not end the run.
              summary.listingsFailed += 1;
              this.logger.error(`Processing ${connector.slug} listing ${listing.externalId} failed`, error as Error);
              continue;
            }
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

      this.recordBelowFloor(summary, platform.slug);
      await this.repository.completeJob(jobId, summary);
      return summary;
    } catch (error) {
      this.recordBelowFloor(summary, platform.slug);
      this.logger.error(`Ingestion failed for platform ${platform.slug}`, error as Error);
      await this.repository.failJob(jobId, error instanceof Error ? error.message : String(error), summary);
      throw error;
    }
  }

  /**
   * Second ingestion phase. The generic sweep finds each store's own top
   * products, so two stores rarely surface the SAME product and most products
   * end up with one store's listing.
   *
   * Here the products just discovered get a specific "brand model storage"
   * query, and every OTHER enabled store is searched for exactly that product.
   * Results flow through the normal pipeline, which merges them onto the same
   * product.
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
    const limitPerQuery = Math.max(1, this.configService.get<number>('retailers.crossStoreBackfillLimitPerQuery', 5));
    if (maxProducts === 0) {
      return;
    }

    const usablePlatforms = platforms.filter((platform) => this.connectors.isEnabled(platform.slug));
    if (usablePlatforms.length < 2) {
      // Nothing to cross-reference against with fewer than two live stores.
      return;
    }

    const summaryBySlug = new Map(summaries.map((summary) => [summary.platformSlug, summary]));

    // Only the stores missing each product are re-queried. Products with the
    // fewest covering stores go first (the "1 store" case is the point).
    const products = await this.repository.findProductsWithCoverage(Array.from(touchedProductIds));
    const ranked = products
      .map((product) => ({
        product,
        coveringPlatformIds: new Set(product.sourceListings.map((listing) => listing.platformId)),
      }))
      .sort((a, b) => a.coveringPlatformIds.size - b.coveringPlatformIds.size)
      .slice(0, maxProducts);

    for (const { product, coveringPlatformIds } of ranked) {
      const query = buildProductQuery(product, this.normalizer);
      if (!query) {
        continue;
      }

      for (const platform of usablePlatforms) {
        if (coveringPlatformIds.has(platform.id)) {
          continue;
        }
        const connector = this.connectors.get(platform.slug);
        if (!connector || this.storeCalls.isPaused(platform.slug)) {
          continue;
        }

        try {
          const listings = await this.storeCalls.search(connector, query, limitPerQuery);
          const summary = summaryBySlug.get(platform.slug);

          for (const listing of listings) {
            if (!hasUsablePrice(listing.priceUsd)) {
              await this.processor.recordUnpriced(platform, listing);
              continue;
            }

            const result = await this.processor.process(platform, product.category, listing, connector.slug);
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
          this.logger.warn(`Cross-store backfill for "${query}" on ${platform.slug} failed: ${message}`);
        }
      }
    }
  }
}
