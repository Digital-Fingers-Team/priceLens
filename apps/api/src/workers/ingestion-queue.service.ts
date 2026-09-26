import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { JobOptions, Queue } from 'bull';
import {
  INGESTION_QUEUE,
  LiveIngestionJobData,
  RUN_LIVE_INGESTION_JOB,
  RUN_QUERY_INGESTION_JOB,
  RUN_RECONCILIATION_JOB,
  RUN_STORE_COVERAGE_SWEEP_JOB,
  RUN_STORE_EXPANSION_JOB,
  ReconciliationJobData,
  StoreCoverageSweepJobData,
} from './ingestion.jobs';
import { withTimeout } from '../common/redis-resilience';

/**
 * How long an enqueue may take. Bull queues commands while Redis is
 * unreachable, so without a bound a search request would hang until Redis
 * came back (B-01). A healthy Redis answers in a few milliseconds.
 */
export const ENQUEUE_TIMEOUT_MS = 1_000;

/**
 * Bull priorities, 1 = first. A shopper waiting on a search must not queue
 * behind hundreds of background store expansions: it did, for 45 minutes.
 * Bull inserts a prioritised job ahead of every unprioritised one.
 */
export const JOB_PRIORITY = { userSearch: 1, admin: 2, storeExpansion: 10 } as const;

/**
 * The one place on-demand ingestion jobs are enqueued. Each method fixes the
 * job's name, payload shape and deduplication id. On-demand jobs are removed
 * when done (completed or failed): they are triggers, not records. Every
 * enqueue fails with RedisTimeoutError after ENQUEUE_TIMEOUT_MS.
 */
@Injectable()
export class IngestionQueue {
  constructor(@InjectQueue(INGESTION_QUEUE) private readonly queue: Queue) {}

  private add(name: string, data: object, options: JobOptions) {
    return withTimeout(this.queue.add(name, data, options), ENQUEUE_TIMEOUT_MS, `Enqueue ${name}`);
  }

  /**
   * Scrape what a user searched for. Deduplicated per query: Bull returns the
   * in-flight job instead of adding a second one.
   */
  async enqueueQueryIngestion(query: string, limitPerQuery: number): Promise<void> {
    await this.add(
      RUN_QUERY_INGESTION_JOB,
      { query, limitPerQuery },
      {
        jobId: `on-demand-live-fetch:${query}`,
        priority: JOB_PRIORITY.userSearch,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  /** Search the stores missing one product. Deduplicated per product. */
  async enqueueStoreExpansion(productId: string, targetStores: number): Promise<void> {
    await this.add(
      RUN_STORE_EXPANSION_JOB,
      { productId, targetStores },
      {
        jobId: `store-expansion:${productId}`,
        priority: JOB_PRIORITY.storeExpansion,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  /** Admin-triggered category sweep. Deduplicated per set of stores. */
  async enqueueLiveIngestion(data: LiveIngestionJobData): Promise<string> {
    const job = await this.add(RUN_LIVE_INGESTION_JOB, data, {
      jobId: `manual-live-fetch:${(data.platformSlugs ?? ['all']).join(',')}`,
      priority: JOB_PRIORITY.admin,
      removeOnComplete: true,
      removeOnFail: true,
    });
    return String(job.id);
  }

  /** Admin-triggered duplicate reconciliation. */
  async enqueueReconciliation(data: ReconciliationJobData): Promise<string> {
    const job = await this.add(RUN_RECONCILIATION_JOB, data, {
      jobId: `manual-reconcile:${Date.now()}`,
      priority: JOB_PRIORITY.admin,
      removeOnComplete: true,
      removeOnFail: true,
    });
    return String(job.id);
  }

  /** Admin-triggered coverage sweep. */
  async enqueueStoreCoverageSweep(data: StoreCoverageSweepJobData): Promise<string> {
    const job = await this.add(RUN_STORE_COVERAGE_SWEEP_JOB, data, {
      jobId: `manual-store-coverage-sweep:${Date.now()}`,
      priority: JOB_PRIORITY.admin,
      removeOnComplete: true,
      removeOnFail: true,
    });
    return String(job.id);
  }
}
