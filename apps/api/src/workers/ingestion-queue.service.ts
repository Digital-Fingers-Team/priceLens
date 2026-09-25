import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bull';
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

/**
 * The one place on-demand ingestion jobs are enqueued. Each method fixes the
 * job's name, payload shape and deduplication id. On-demand jobs are removed
 * when done (completed or failed): they are triggers, not records.
 */
@Injectable()
export class IngestionQueue {
  constructor(@InjectQueue(INGESTION_QUEUE) private readonly queue: Queue) {}

  /**
   * Scrape what a user searched for. Deduplicated per query: Bull returns the
   * in-flight job instead of adding a second one.
   */
  async enqueueQueryIngestion(query: string, limitPerQuery: number): Promise<void> {
    await this.queue.add(
      RUN_QUERY_INGESTION_JOB,
      { query, limitPerQuery },
      { jobId: `on-demand-live-fetch:${query}`, removeOnComplete: true, removeOnFail: true },
    );
  }

  /** Search the stores missing one product. Deduplicated per product. */
  async enqueueStoreExpansion(productId: string, targetStores: number): Promise<void> {
    await this.queue.add(
      RUN_STORE_EXPANSION_JOB,
      { productId, targetStores },
      { jobId: `store-expansion:${productId}`, removeOnComplete: true, removeOnFail: true },
    );
  }

  /** Admin-triggered category sweep. Deduplicated per set of stores. */
  async enqueueLiveIngestion(data: LiveIngestionJobData): Promise<string> {
    const job = await this.queue.add(RUN_LIVE_INGESTION_JOB, data, {
      jobId: `manual-live-fetch:${(data.platformSlugs ?? ['all']).join(',')}`,
      removeOnComplete: true,
      removeOnFail: true,
    });
    return String(job.id);
  }

  /** Admin-triggered duplicate reconciliation. */
  async enqueueReconciliation(data: ReconciliationJobData): Promise<string> {
    const job = await this.queue.add(RUN_RECONCILIATION_JOB, data, {
      jobId: `manual-reconcile:${Date.now()}`,
      removeOnComplete: true,
      removeOnFail: true,
    });
    return String(job.id);
  }

  /** Admin-triggered coverage sweep. */
  async enqueueStoreCoverageSweep(data: StoreCoverageSweepJobData): Promise<string> {
    const job = await this.queue.add(RUN_STORE_COVERAGE_SWEEP_JOB, data, {
      jobId: `manual-store-coverage-sweep:${Date.now()}`,
      removeOnComplete: true,
      removeOnFail: true,
    });
    return String(job.id);
  }
}
