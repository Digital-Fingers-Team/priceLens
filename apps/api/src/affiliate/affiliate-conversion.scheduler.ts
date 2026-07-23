import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import { AFFILIATE_CONVERSION_QUEUE, RUN_CONVERSION_POLL_JOB } from './affiliate.constants';

const REPEATABLE_JOB_ID = 'scheduled-affiliate-conversion-poll';

@Injectable()
export class AffiliateConversionScheduler implements OnModuleInit {
  private readonly logger = new Logger(AffiliateConversionScheduler.name);

  constructor(
    @InjectQueue(AFFILIATE_CONVERSION_QUEUE) private readonly queue: Queue,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
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
