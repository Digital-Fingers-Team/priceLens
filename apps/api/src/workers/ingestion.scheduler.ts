import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import {
  INGESTION_QUEUE,
  RUN_LIVE_INGESTION_JOB,
  RUN_RECONCILIATION_JOB,
  RUN_STORE_COVERAGE_SWEEP_JOB,
  RUN_PRICE_ALERTS_JOB,
  RUN_NOTIFICATION_RETRY_JOB,
  RUN_SUBSCRIPTION_MAINTENANCE_JOB,
  RUN_COMPETITOR_DETECTION_JOB,
  RUN_MAP_SWEEP_JOB,
  RUN_LAUNCH_DETECTION_JOB,
  RUN_WEEKLY_REPORTS_JOB,
} from './ingestion.jobs';

const REPEATABLE_JOB_ID = 'scheduled-live-ingestion';
const RECONCILIATION_JOB_ID = 'scheduled-reconciliation';
const STORE_COVERAGE_SWEEP_JOB_ID = 'scheduled-store-coverage-sweep';
const PRICE_ALERTS_JOB_ID = 'scheduled-price-alerts';
const NOTIFICATION_RETRY_JOB_ID = 'scheduled-notification-retry';
const SUBSCRIPTION_MAINTENANCE_JOB_ID = 'scheduled-subscription-maintenance';
const COMPETITOR_DETECTION_JOB_ID = 'scheduled-competitor-detection';
const MAP_SWEEP_JOB_ID = 'scheduled-map-sweep';
const LAUNCH_DETECTION_JOB_ID = 'scheduled-launch-detection';
const WEEKLY_REPORTS_JOB_ID = 'scheduled-weekly-reports';

@Injectable()
export class IngestionScheduler implements OnModuleInit {
  private readonly logger = new Logger(IngestionScheduler.name);

  constructor(
    @InjectQueue(INGESTION_QUEUE) private readonly queue: Queue,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    const existingRepeatableJobs = await this.queue.getRepeatableJobs();
    for (const repeatableJob of existingRepeatableJobs) {
      await this.queue.removeRepeatableByKey(repeatableJob.key);
    }

    if (!this.configService.get<boolean>('retailers.liveIngestionScheduleEnabled', true)) {
      this.logger.log('Scheduled live ingestion is disabled (LIVE_INGESTION_SCHEDULE_ENABLED=false)');
      return;
    }

    const cron = this.configService.get<string>('retailers.liveIngestionCron', '0 */6 * * *');

    await this.queue.add(
      RUN_LIVE_INGESTION_JOB,
      {},
      {
        jobId: REPEATABLE_JOB_ID,
        repeat: { cron },
      },
    );

    this.logger.log(`Scheduled live ingestion to run on cron "${cron}"`);

    await this.scheduleReconciliation();
    await this.scheduleStoreCoverageSweep();
    await this.scheduleOperationalJobs();
  }

  /**
   * Jobs that keep the subscription and notification systems honest.
   *
   * Both are idempotent and cheap, and both exist because external systems are
   * unreliable -- a missed Stripe webhook, a flaky SMTP host -- so unlike the
   * scrapers they are not behind an enable/disable flag.
   */
  private async scheduleOperationalJobs() {
    const retryCron = this.configService.get<string>('retailers.notificationRetryCron', '*/15 * * * *');
    await this.queue.add(
      RUN_NOTIFICATION_RETRY_JOB,
      {},
      { jobId: NOTIFICATION_RETRY_JOB_ID, repeat: { cron: retryCron } },
    );

    const maintenanceCron = this.configService.get<string>('retailers.subscriptionMaintenanceCron', '17 * * * *');
    await this.queue.add(
      RUN_SUBSCRIPTION_MAINTENANCE_JOB,
      {},
      { jobId: SUBSCRIPTION_MAINTENANCE_JOB_ID, repeat: { cron: maintenanceCron } },
    );

    // Runs on the half hour, between ingestion runs, so it reads prices that
    // have just been refreshed rather than racing the scraper.
    const detectionCron = this.configService.get<string>('retailers.competitorDetectionCron', '45 */3 * * *');
    await this.queue.add(
      RUN_COMPETITOR_DETECTION_JOB,
      {},
      { jobId: COMPETITOR_DETECTION_JOB_ID, repeat: { cron: detectionCron } },
    );

    // Brand-side sweeps. All three are idempotent and cheap when no brand
    // workspace exists, so they are not behind a feature flag.
    const mapCron = this.configService.get<string>('retailers.mapSweepCron', '50 */3 * * *');
    await this.queue.add(RUN_MAP_SWEEP_JOB, {}, { jobId: MAP_SWEEP_JOB_ID, repeat: { cron: mapCron } });

    const launchCron = this.configService.get<string>('retailers.launchDetectionCron', '20 */6 * * *');
    await this.queue.add(
      RUN_LAUNCH_DETECTION_JOB,
      {},
      { jobId: LAUNCH_DETECTION_JOB_ID, repeat: { cron: launchCron } },
    );

    // Monday morning, covering the week that just ended.
    const reportsCron = this.configService.get<string>('retailers.weeklyReportsCron', '0 6 * * 1');
    await this.queue.add(
      RUN_WEEKLY_REPORTS_JOB,
      {},
      { jobId: WEEKLY_REPORTS_JOB_ID, repeat: { cron: reportsCron } },
    );

    this.logger.log(
      `Scheduled notification retry (${retryCron}), subscription maintenance (${maintenanceCron}), ` +
        `competitor detection (${detectionCron}), MAP sweep (${mapCron}), ` +
        `launch detection (${launchCron}) and weekly reports (${reportsCron})`,
    );
  }

  /**
   * The duplicate-reconciliation pass (merges canonicals that turned out to be
   * the same product). Separate cron from ingestion; dry-run vs real-merge is
   * decided inside ReconciliationService from RECONCILIATION_DRY_RUN.
   */
  private async scheduleReconciliation() {
    if (!this.configService.get<boolean>('search.reconciliationScheduleEnabled', true)) {
      this.logger.log('Scheduled reconciliation is disabled (RECONCILIATION_SCHEDULE_ENABLED=false)');
      return;
    }

    const cron = this.configService.get<string>('search.reconciliationCron', '0 * * * *');
    await this.queue.add(
      RUN_RECONCILIATION_JOB,
      {},
      {
        jobId: RECONCILIATION_JOB_ID,
        repeat: { cron },
      },
    );
    this.logger.log(`Scheduled reconciliation to run on cron "${cron}"`);
  }

  /**
   * Catches products that fall under minStoresPerProduct without anyone browsing
   * to them -- the reactive triggers (product detail view, search hit) only reach
   * products someone actually looks at. See StoreCoverageService.runStoreCoverageSweep.
   */
  private async scheduleStoreCoverageSweep() {
    if (!this.configService.get<boolean>('retailers.storeCoverageSweepEnabled', true)) {
      this.logger.log('Scheduled store coverage sweep is disabled (STORE_COVERAGE_SWEEP_ENABLED=false)');
      return;
    }

    const cron = this.configService.get<string>('retailers.storeCoverageSweepCron', '30 */2 * * *');
    await this.queue.add(
      RUN_STORE_COVERAGE_SWEEP_JOB,
      {},
      {
        jobId: STORE_COVERAGE_SWEEP_JOB_ID,
        repeat: { cron },
      },
    );

    // Price alerts are cheap to evaluate and users expect them to be timely,
    // so run them far more often than the scraping sweeps.
    const priceAlertCron = this.configService.get<string>('retailers.priceAlertCron', '*/30 * * * *');

    await this.queue.add(
      RUN_PRICE_ALERTS_JOB,
      {},
      {
        jobId: PRICE_ALERTS_JOB_ID,
        repeat: { cron: priceAlertCron },
      },
    );

    this.logger.log(`Scheduled price alert evaluation (${priceAlertCron})`);
    this.logger.log(`Scheduled store coverage sweep to run on cron "${cron}"`);
  }
}
