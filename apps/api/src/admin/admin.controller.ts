import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { CurrentUser, Roles } from '../common/decorators';
import { AdminService, ResolveReviewItemInput } from './admin.service';
import type { User } from '@prisma/client';
import { UserRole } from '@prisma/client';
import {
  INGESTION_QUEUE,
  RUN_LIVE_INGESTION_JOB,
  RUN_RECONCILIATION_JOB,
  RUN_STORE_COVERAGE_SWEEP_JOB,
} from '../workers/ingestion.processor';

interface RunLiveIngestionBody {
  platformSlugs?: string[];
  limitPerQuery?: number;
}

interface RunReconciliationBody {
  dryRun?: boolean;
  maxPairs?: number;
}

interface RunStoreCoverageSweepBody {
  maxProducts?: number;
}

@Controller('admin')
export class AdminController {
  constructor(
    @InjectQueue(INGESTION_QUEUE) private readonly ingestionQueue: Queue,
    private readonly adminService: AdminService,
  ) {}

  @Get('dashboard')
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  async getDashboard() {
    return this.adminService.getDashboardStats();
  }

  @Get('review-queue')
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  async getReviewQueue(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.getReviewQueue(Number(page) || 1, Number(limit) || 20);
  }

  @Patch('review-queue/:id/resolve')
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  async resolveReviewItem(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() body: ResolveReviewItemInput,
  ) {
    return this.adminService.resolveReviewItem(id, user.id, body);
  }

  @Get('platforms')
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  async getPlatforms() {
    return this.adminService.getPlatforms();
  }

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

  @Post('store-coverage-sweep')
  @Roles(UserRole.ADMIN)
  async runStoreCoverageSweep(@Body() body: RunStoreCoverageSweepBody = {}) {
    const maxProducts = typeof body.maxProducts === 'number' ? body.maxProducts : undefined;

    // Scrapes every under-covered product's missing stores -- can run for a
    // while, so queue it rather than block the request.
    const job = await this.ingestionQueue.add(
      RUN_STORE_COVERAGE_SWEEP_JOB,
      { maxProducts },
      {
        jobId: `manual-store-coverage-sweep:${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    return { queued: true, jobId: String(job.id) };
  }
}
