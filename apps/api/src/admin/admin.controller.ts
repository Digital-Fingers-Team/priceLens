import { Body, Controller, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';
import {
  INGESTION_QUEUE,
  RUN_LIVE_INGESTION_JOB,
  RUN_RECONCILIATION_JOB,
} from '../workers/ingestion.processor';

interface RunLiveIngestionBody {
  platformSlugs?: string[];
  limitPerQuery?: number;
}

interface RunReconciliationBody {
  dryRun?: boolean;
  maxPairs?: number;
}

@Controller('admin')
export class AdminController {
  constructor(@InjectQueue(INGESTION_QUEUE) private readonly ingestionQueue: Queue) {}

  @Post('ingest/live')
  @Roles(UserRole.ADMIN)
  async runLiveIngestion(@Body() body: RunLiveIngestionBody = {}) {
    const platformSlugs = Array.isArray(body.platformSlugs) ? body.platformSlugs : undefined;
    const limitPerQuery = typeof body.limitPerQuery === 'number' ? body.limitPerQuery : undefined;

    // A full sweep (dozens of scraper requests per platform) can run for minutes —
    // queue it instead of blocking the request past the frontend's timeout.
    const job = await this.ingestionQueue.add(
      RUN_LIVE_INGESTION_JOB,
      { platformSlugs, limitPerQuery },
      {
        jobId: `manual-live-fetch:${(platformSlugs ?? ['all']).join(',')}`,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    return { queued: true, jobId: String(job.id), platformSlugs: platformSlugs ?? [] };
  }

  @Post('reconcile')
  @Roles(UserRole.ADMIN)
  async runReconciliation(@Body() body: RunReconciliationBody = {}) {
    const dryRun = typeof body.dryRun === 'boolean' ? body.dryRun : undefined;
    const maxPairs = typeof body.maxPairs === 'number' ? body.maxPairs : undefined;

    // Scanning the whole catalog + LLM calls per candidate pair can run for a
    // while — queue it rather than block the request.
    const job = await this.ingestionQueue.add(
      RUN_RECONCILIATION_JOB,
      { dryRun, maxPairs },
      {
        jobId: `manual-reconcile:${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    return { queued: true, jobId: String(job.id), dryRun: dryRun ?? 'env-default' };
  }
}
