import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { LiveIngestionService, LiveIngestionOptions } from '../scraping/live-ingestion.service';

export const INGESTION_QUEUE = 'ingestion';
export const RUN_LIVE_INGESTION_JOB = 'run-live-ingestion';
export const RUN_QUERY_INGESTION_JOB = 'run-query-ingestion';

interface RunQueryIngestionData extends LiveIngestionOptions {
  query: string;
}

@Processor(INGESTION_QUEUE)
export class IngestionProcessor {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(private readonly liveIngestionService: LiveIngestionService) {}

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
