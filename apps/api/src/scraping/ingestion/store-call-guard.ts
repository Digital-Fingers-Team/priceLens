import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KeyedMutex } from '../../common/keyed-mutex';
import type { RetailerConnector } from '../interfaces/retailer-connector.interface';
import type { RetailerListing } from '../interfaces/retailer-listing.interface';
import { ConnectorCircuitBreaker } from './connector-circuit-breaker';

/** Thrown instead of calling a store whose circuit is open. */
export class StoreUnavailableError extends Error {
  constructor(readonly slug: string) {
    super(`Store "${slug}" is paused after repeated failures`);
    this.name = 'StoreUnavailableError';
  }
}

export interface StoreSearchOptions {
  /**
   * Count an empty result as a failure. Only for broad queries a working
   * store always answers (the category sweep): blocked connectors log and
   * return [] instead of throwing. Otherwise an empty answer counts as
   * neither success nor failure: a store not carrying one specific product,
   * or finding nothing for what a user typed, is a normal answer. Counting
   * those paused small stores for every caller once the breaker was shared.
   */
  emptyIsFailure?: boolean;
}

/**
 * Every search sent to a store goes through here (B-07), so all ingestion
 * paths -- sweep, on-demand query, cross-store backfill, coverage expansion --
 * share one view of each store:
 * - one circuit breaker: a store that keeps failing is paused for everyone,
 *   not just for the path that noticed;
 * - pacing: calls to one store are spaced at least `minIntervalMs` apart
 *   (they already run one at a time per store, since each store has one
 *   browser context);
 * - one retry, after a short backoff, when the call throws (timeouts,
 *   navigation errors). An empty result is not retried.
 */
@Injectable()
export class StoreCallGuard {
  private readonly logger = new Logger(StoreCallGuard.name);
  private readonly breaker: ConnectorCircuitBreaker;
  private readonly perStore = new KeyedMutex();
  private readonly lastCallAt = new Map<string, number>();

  /** Overridable in tests. */
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  constructor(private readonly config: ConfigService) {
    this.breaker = new ConnectorCircuitBreaker(() => ({
      threshold: Math.max(1, this.config.get<number>('retailers.connectorFailureThreshold', 5)),
      cooldownMinutes: Math.max(1, this.config.get<number>('retailers.connectorCooldownMinutes', 30)),
    }));
  }

  isPaused(slug: string): boolean {
    return this.breaker.isInCooldown(slug);
  }

  async search(
    connector: RetailerConnector,
    query: string,
    limit: number,
    options: StoreSearchOptions = {},
  ): Promise<RetailerListing[]> {
    const slug = connector.slug;
    if (this.breaker.isInCooldown(slug)) {
      throw new StoreUnavailableError(slug);
    }

    return this.perStore.run(slug, async () => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= 2; attempt++) {
        await this.pace(slug);
        try {
          const listings = await connector.searchListings(query, limit);
          if (listings.length > 0) {
            this.breaker.recordSuccess(slug);
          } else if (options.emptyIsFailure) {
            this.breaker.recordFailure(slug, 'returned no listings');
          }
          return listings;
        } catch (error) {
          lastError = error;
          if (attempt === 1) {
            this.logger.warn(`${slug} search "${query}" failed, retrying once: ${(error as Error).message}`);
            await this.sleep(this.retryDelayMs());
          }
        }
      }
      this.breaker.recordFailure(slug, (lastError as Error)?.message ?? String(lastError));
      throw lastError;
    });
  }

  private async pace(slug: string): Promise<void> {
    const minInterval = this.minIntervalMs();
    const last = this.lastCallAt.get(slug);
    if (last != null) {
      const wait = last + minInterval - Date.now();
      if (wait > 0) await this.sleep(wait);
    }
    this.lastCallAt.set(slug, Date.now());
  }

  private minIntervalMs(): number {
    return Math.max(0, this.config.get<number>('retailers.storeMinRequestIntervalMs', 2000));
  }

  private retryDelayMs(): number {
    return Math.max(0, this.config.get<number>('retailers.storeRetryDelayMs', 3000));
  }
}
