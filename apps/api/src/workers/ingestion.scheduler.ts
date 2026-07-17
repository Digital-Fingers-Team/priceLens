import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import {
  INGESTION_QUEUE,
  RUN_LIVE_INGESTION_JOB,
  RUN_RECONCILIATION_JOB,
  RUN_STORE_COVERAGE_SWEEP_JOB,
} from './ingestion.processor';

const REPEATABLE_JOB_ID = 'scheduled-live-ingestion';
const RECONCILIATION_JOB_ID = 'scheduled-reconciliation';
const STORE_COVERAGE_SWEEP_JOB_ID = 'scheduled-store-coverage-sweep';

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
   * products someone actually looks at. See LiveIngestionService.runStoreCoverageSweep.
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
    this.logger.log(`Scheduled store coverage sweep to run on cron "${cron}"`);
  }
}
