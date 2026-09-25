import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Category, Platform } from '@prisma/client';
import { NormalizerService } from '../matching/normalizer.service';
import { hasUsablePrice } from '../matching/pipeline';
import { ConnectorRegistry } from './connectors/connector.registry';
import type { RetailerConnector } from './interfaces/retailer-connector.interface';
import { IngestionRepository } from './ingestion/ingestion.repository';
import { ListingProcessor } from './ingestion/listing-processor.service';
import { buildProductQuery, buildQueriesForCategory, pickCategoryForQuery } from './ingestion/search-queries';

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

    for (const platform of platforms) {
      const connector = this.usableConnector(platform, skippedPlatforms);
      if (!connector) {
        continue;
      }

      try {
        const categories = await this.repository.findSweepCategories();
        const categoryQueries = categories.map((category) => ({
          category,
          queries: buildQueriesForCategory(category),
        }));
        summaries.push(
          await this.runIngestionJob(
            platform,
            connector,
            limitPerQuery,
            categoryQueries,
            { categoryCount: categories.length },
            touchedProductIds,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        skippedPlatforms.push({ slug: platform.slug, reason: `ingestion_failed:${message}` });
      }
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

    const category = pickCategoryForQuery(trimmedQuery, await this.repository.findLeafCategories());

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
    return connector;
  }

  private async runIngestionJob(
    platform: Platform,
    connector: RetailerConnector,
    limitPerQuery: number,
    categoryQueries: Array<{ category: Category; queries: string[] }>,
    extraPayload: Record<string, unknown> = {},
    touchedProductIds?: Set<string>,
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

            // Pipeline step 1: price gate.
            if (!hasUsablePrice(listing.priceUsd)) {
              this.logger.warn(
                `Skipping listing "${listing.title}" from ${connector.slug} — no usable price (likely a scrape error, not a real product)`,
              );
              continue;
            }

            summary.listingsDiscovered += 1;

            const result = await this.processor.process(platform, category, listing, connector.slug);
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

      await this.repository.completeJob(jobId, summary);
      return summary;
    } catch (error) {
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
