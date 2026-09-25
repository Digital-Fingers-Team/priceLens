/**
 * The contract of the `ingestion` Bull queue: its name, its job names and
 * each job's payload. Producers (IngestionQueue, the scheduler) and the
 * consumer (IngestionProcessor) both depend on this file; neither depends on
 * the other.
 */
export const INGESTION_QUEUE = 'ingestion';

export const RUN_LIVE_INGESTION_JOB = 'run-live-ingestion';
export const RUN_QUERY_INGESTION_JOB = 'run-query-ingestion';
export const RUN_RECONCILIATION_JOB = 'run-reconciliation';
export const RUN_STORE_EXPANSION_JOB = 'run-store-expansion';
export const RUN_STORE_COVERAGE_SWEEP_JOB = 'run-store-coverage-sweep';
export const RUN_PRICE_ALERTS_JOB = 'run-price-alerts';
export const RUN_NOTIFICATION_RETRY_JOB = 'run-notification-retry';
export const RUN_SUBSCRIPTION_MAINTENANCE_JOB = 'run-subscription-maintenance';
export const RUN_COMPETITOR_DETECTION_JOB = 'run-competitor-detection';
export const RUN_MAP_SWEEP_JOB = 'run-map-sweep';
export const RUN_LAUNCH_DETECTION_JOB = 'run-launch-detection';
export const RUN_WEEKLY_REPORTS_JOB = 'run-weekly-reports';

/** run-live-ingestion: a category sweep over some or all stores. */
export interface LiveIngestionJobData {
  platformSlugs?: string[];
  limitPerQuery?: number;
}

/** run-query-ingestion: scrape what a user searched for. */
export interface QueryIngestionJobData extends LiveIngestionJobData {
  query: string;
}

/** run-store-expansion: search the stores that don't carry one product yet. */
export interface StoreExpansionJobData {
  productId: string;
  targetStores?: number;
}

/** run-store-coverage-sweep */
export interface StoreCoverageSweepJobData {
  maxProducts?: number;
}

/** run-reconciliation: merge duplicate products. */
export interface ReconciliationJobData {
  /** When true, only log proposed merges. Defaults to RECONCILIATION_DRY_RUN. */
  dryRun?: boolean;
  maxPairs?: number;
}
