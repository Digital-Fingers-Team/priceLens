import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { LiveIngestionService, LiveIngestionOptions } from '../scraping/live-ingestion.service';
import { ReconciliationOptions, ReconciliationService } from '../matching/reconciliation.service';
import { PriceAlertService } from '../watchlist/price-alert.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionsService } from '../billing/subscriptions.service';

export const INGESTION_QUEUE = 'ingestion';
export const RUN_LIVE_INGESTION_JOB = 'run-live-ingestion';
export const RUN_QUERY_INGESTION_JOB = 'run-query-ingestion';
export const RUN_RECONCILIATION_JOB = 'run-reconciliation';
export const RUN_STORE_EXPANSION_JOB = 'run-store-expansion';
export const RUN_STORE_COVERAGE_SWEEP_JOB = 'run-store-coverage-sweep';
export const RUN_PRICE_ALERTS_JOB = 'run-price-alerts';
export const RUN_NOTIFICATION_RETRY_JOB = 'run-notification-retry';
export const RUN_SUBSCRIPTION_MAINTENANCE_JOB = 'run-subscription-maintenance';

interface RunQueryIngestionData extends LiveIngestionOptions {
  query: string;
}

interface RunStoreExpansionData {
  productId: string;
  targetStores?: number;
}

@Processor(INGESTION_QUEUE)
export class IngestionProcessor {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(
    private readonly liveIngestionService: LiveIngestionService,
    private readonly reconciliationService: ReconciliationService,
    private readonly priceAlertService: PriceAlertService,
    private readonly notificationsService: NotificationsService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * Retries notification deliveries that failed transiently (SMTP timeout,
   * Telegram 5xx). Bounded by maxDeliveryAttempts, so a permanently bad
   * address drains out instead of being retried forever.
   */
  @Process(RUN_NOTIFICATION_RETRY_JOB)
  async handleNotificationRetry() {
    const result = await this.notificationsService.retryFailedDeliveries();
    if (result.retried > 0) {
      this.logger.log(`Notification retry: ${result.recovered}/${result.retried} recovered`);
    }
    return result;
  }

  /**
   * Reconciles subscriptions whose paid period has elapsed without a renewal
   * webhook arriving. EntitlementsService already refuses to honour an expired
   * period, so this only brings stored state back in line.
   */
  @Process(RUN_SUBSCRIPTION_MAINTENANCE_JOB)
  async handleSubscriptionMaintenance() {
    const expired = await this.subscriptionsService.expireLapsedSubscriptions();
    return { expired };
  }

  @Process(RUN_PRICE_ALERTS_JOB)
  async handlePriceAlerts() {
    this.logger.log('Evaluating active price alerts');
    const result = await this.priceAlertService.evaluateActiveAlerts();
    this.logger.log(
      `Price alert evaluation finished: ${result.checked} checked, ${result.triggered} triggered, ` +
        `${result.notified} notified`,
    );
    return result;
  }

  @Process(RUN_RECONCILIATION_JOB)
  async handleRunReconciliation(job: Job<ReconciliationOptions>) {
    this.logger.log(`Starting reconciliation (job ${job.id})`);
    const report = await this.reconciliationService.reconcile(job.data ?? {});
    this.logger.log(
      `Finished reconciliation (job ${job.id}): ${report.merges.length} ` +
        `${report.dryRun ? 'proposed' : 'executed'} merge(s) over ${report.pairsExamined} pair(s)`,
    );
    return report;
  }

  @Process(RUN_LIVE_INGESTION_JOB)
  async handleRunLiveIngestion(job: Job<LiveIngestionOptions>) {
    this.logger.log(`Starting live ingestion (job ${job.id})`);
    const report = await this.liveIngestionService.runLiveIngestion(job.data ?? {});
    this.logger.log(
      `Finished live ingestion (job ${job.id}): ` +
        `${report.platforms.length} platform(s) ingested, ${report.skippedPlatforms.length} skipped`,
    );
    return report;
  }

  @Process(RUN_STORE_EXPANSION_JOB)
  async handleRunStoreExpansion(job: Job<RunStoreExpansionData>) {
    const { productId, targetStores } = job.data;
    this.logger.log(`Starting store expansion for product ${productId} (job ${job.id})`);
    await this.liveIngestionService.expandProductStores(productId, targetStores);
    this.logger.log(`Finished store expansion for product ${productId} (job ${job.id})`);
  }

  @Process(RUN_STORE_COVERAGE_SWEEP_JOB)
  async handleRunStoreCoverageSweep(job: Job<{ maxProducts?: number }>) {
    this.logger.log(`Starting store coverage sweep (job ${job.id})`);
    const { scanned, expanded } = await this.liveIngestionService.runStoreCoverageSweep(
      job.data?.maxProducts,
    );
    this.logger.log(
      `Finished store coverage sweep (job ${job.id}): ${expanded}/${scanned} product(s) processed`,
    );
  }

  @Process(RUN_QUERY_INGESTION_JOB)
  async handleRunQueryIngestion(job: Job<RunQueryIngestionData>) {
    const { query, ...options } = job.data;
    this.logger.log(`Starting query-triggered ingestion for "${query}" (job ${job.id})`);
    const report = await this.liveIngestionService.runQueryIngestion(query, options);
    this.logger.log(
      `Finished query-triggered ingestion for "${query}" (job ${job.id}): ` +
        `${report.platforms.length} platform(s) ingested, ${report.skippedPlatforms.length} skipped`,
    );
    return report;
  }
}
