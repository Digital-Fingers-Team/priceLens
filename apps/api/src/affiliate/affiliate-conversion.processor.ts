import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { AFFILIATE_CONVERSION_QUEUE, RUN_CONVERSION_POLL_JOB } from './affiliate.constants';
import { ConversionReconciliationService } from './conversion-reconciliation.service';

@Processor(AFFILIATE_CONVERSION_QUEUE)
export class AffiliateConversionProcessor {
  private readonly logger = new Logger(AffiliateConversionProcessor.name);

  constructor(private readonly reconciliationService: ConversionReconciliationService) {}

  @Process(RUN_CONVERSION_POLL_JOB)
  async handleRunConversionPoll(job: Job) {
    this.logger.log(`Starting conversion poll (job ${job.id})`);
    const results = await this.reconciliationService.pollAll();
    const totalFetched = results.reduce((sum, r) => sum + r.fetched, 0);
    const totalReconciled = results.reduce((sum, r) => sum + r.reconciled, 0);
    this.logger.log(
      `Finished conversion poll (job ${job.id}): ${totalReconciled}/${totalFetched} ` +
        `conversion(s) reconciled across ${results.length} network(s)`,
    );
    return results;
  }
}
