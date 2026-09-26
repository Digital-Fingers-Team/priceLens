import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import { AFFILIATE_CONVERSION_QUEUE, RUN_CONVERSION_POLL_JOB } from './affiliate.constants';
import { retryUntilDone } from '../common/redis-resilience';

const REPEATABLE_JOB_ID = 'scheduled-affiliate-conversion-poll';

@Injectable()
export class AffiliateConversionScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AffiliateConversionScheduler.name);
  private stopped = false;
  registration: Promise<void> = Promise.resolve();

  constructor(
    @InjectQueue(AFFILIATE_CONVERSION_QUEUE) private readonly queue: Queue,
    private readonly configService: ConfigService,
  ) {}

  /** In the background, like IngestionScheduler: bootstrap never waits on Redis (B-01). */
  onApplicationBootstrap() {
    this.registration = retryUntilDone(() => this.registerJobs(), {
      label: 'Registering the affiliate conversion poll',
      logger: this.logger,
      isStopped: () => this.stopped,
    });
  }

  onApplicationShutdown() {
    this.stopped = true;
  }

  async registerJobs() {
    const existingRepeatableJobs = await this.queue.getRepeatableJobs();
    for (const repeatableJob of existingRepeatableJobs) {
      await this.queue.removeRepeatableByKey(repeatableJob.key);
    }

    if (!this.configService.get<boolean>('affiliate.conversionPollEnabled', true)) {
      this.logger.log('Scheduled conversion poll is disabled (AFFILIATE_CONVERSION_POLL_ENABLED=false)');
      return;
    }

    const cron = this.configService.get<string>('affiliate.conversionPollCron', '0 */2 * * *');
    await this.queue.add(
      RUN_CONVERSION_POLL_JOB,
      {},
      { jobId: REPEATABLE_JOB_ID, repeat: { cron } },
    );
    this.logger.log(`Scheduled affiliate conversion poll to run on cron "${cron}"`);
  }
}
