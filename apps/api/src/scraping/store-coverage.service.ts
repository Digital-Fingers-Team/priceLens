import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NormalizerService } from '../matching/normalizer.service';
import { hasUsablePrice } from '../matching/pipeline';
import { ConnectorRegistry } from './connectors/connector.registry';
import { StoreCallGuard } from './ingestion/store-call-guard';
import { IngestionRepository } from './ingestion/ingestion.repository';
import { ListingProcessor } from './ingestion/listing-processor.service';
import { buildProductQuery } from './ingestion/search-queries';

/**
 * Pushes products toward being compared across `minStoresPerProduct` stores:
 * on demand for one product (product page view, search hit) and as a
 * periodic sweep over the worst-covered part of the catalog.
 */
@Injectable()
export class StoreCoverageService {
  private readonly logger = new Logger(StoreCoverageService.name);

  /** Guards against two scheduled coverage sweeps overlapping. */
  private coverageSweepInFlight = false;

  constructor(
    private readonly repository: IngestionRepository,
    private readonly processor: ListingProcessor,
    private readonly connectors: ConnectorRegistry,
    private readonly normalizer: NormalizerService,
    private readonly configService: ConfigService,
    private readonly storeCalls: StoreCallGuard,
  ) {}

  /**
   * Given one canonical product, keep searching the stores that don't yet
   * carry it -- using its specific "brand model storage" query -- until it's
   * covered by at least `targetStores` distinct stores or every enabled store
   * has been tried.
   *
   * Only stores that return a listing WITH A PRICE count toward coverage:
   * retailers surface out-of-stock results with no price, and those are
   * skipped. The target naturally caps at however many stores are enabled.
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

    const product = await this.repository.findProductForExpansion(productId);
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

    const query = buildProductQuery(product, this.normalizer);
    if (!query) {
      return;
    }

    const platforms = await this.repository.findAllActivePlatforms();
    const missingPlatforms = platforms.filter(
      (platform) => this.connectors.isEnabled(platform.slug) && !coveringPlatformIds.has(platform.id),
    );

    for (const platform of missingPlatforms) {
      if (coveringPlatformIds.size >= targetStores) {
        break;
      }
      const connector = this.connectors.get(platform.slug);
      if (!connector) {
        continue;
      }
      if (this.storeCalls.isPaused(platform.slug)) {
        continue;
      }

      try {
        // An empty answer is neutral here (a store may simply not carry the
        // product); blocked stores are caught by the category sweep, whose
        // broad queries always get results from a working store.
        const listings = await this.storeCalls.search(connector, query, limitPerQuery);
        let coveredByThisStore = false;

        for (const listing of listings) {
          if (!hasUsablePrice(listing.priceUsd)) {
            await this.processor.recordUnpriced(platform, listing);
            continue;
          }

          const result = await this.processor.process(platform, product.category, listing, connector.slug);
          // Only a listing that merged onto THIS product means this store now
          // carries it -- a different match is normal ingestion, but not coverage.
          if (result?.canonicalProductId === productId) {
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
   * Catalog-wide counterpart to expandProductStores: the reactive triggers
   * only reach products someone browses to, so a product nobody has looked at
   * can sit under-covered indefinitely. Runs on a cron, expands the
   * worst-covered products first, bounded per run by
   * storeCoverageSweepBatchSize.
   */
  async runStoreCoverageSweep(maxProductsOverride?: number): Promise<{ scanned: number; expanded: number }> {
    const enabled = this.configService.get<boolean>('retailers.storeCoverageSweepEnabled', true);
    if (!enabled) {
      return { scanned: 0, expanded: 0 };
    }

    // A sweep can outlast its own cron interval on a slow day, and Bull will
    // start the next occurrence anyway. Two concurrent sweeps compete for the
    // same browser contexts, so skip rather than queue: progress is persisted
    // per product, and the next tick picks up where this one left off.
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

      // Products are eligible when they are below the (reachable) target AND
      // the sweep has not already spent effort on them inside the cooldown.
      // Without the second condition a product no other store carries is
      // re-scraped on every run forever -- which is what once pinned this box
      // at 100% CPU.
      const underCovered = await this.repository.findUnderCoveredProducts(minStores, cooldownCutoff, maxProducts);

      let expanded = 0;
      for (const { id } of underCovered) {
        try {
          await this.expandProductStores(id, minStores);
          expanded += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Store coverage sweep failed for product ${id}: ${message}`);
        } finally {
          // Stamped whether or not the expansion found anything or threw: the
          // stamp records that effort was spent, which is what the cooldown is
          // about. Recording only successes would bring the always-failing
          // products straight back next run.
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
   * The configured store target clamped to what is achievable: a product can
   * never be covered by more stores than there are enabled connectors for
   * active platforms. Asking for more makes the sweep's exit condition
   * unsatisfiable rather than ambitious.
   */
  private async resolveCoverageTarget(): Promise<number> {
    const configured = Math.max(1, this.configService.get<number>('retailers.minStoresPerProduct', 4));
    const activePlatforms = await this.repository.findActivePlatformSlugs();
    const reachable = activePlatforms.filter((platform) => this.connectors.isEnabled(platform.slug)).length;

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
      await this.repository.markCoverageAttempt(productId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not record coverage attempt for product ${productId}: ${message}`);
    }
  }
}
