import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../common/decorators';
import { AdminService } from './admin.service';
import type { User } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { IngestionQueue } from '../workers/ingestion-queue.service';
import {
  ResolveReviewItemDto,
  ReviewQueueQueryDto,
  RunLiveIngestionDto,
  RunReconciliationDto,
  RunStoreCoverageSweepDto,
} from './dto/admin.dto';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly ingestionQueue: IngestionQueue,
    private readonly adminService: AdminService,
  ) {}

  @Get('dashboard')
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  async getDashboard() {
    return this.adminService.getDashboardStats();
  }

  @Get('review-queue')
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  async getReviewQueue(@Query() query: ReviewQueueQueryDto) {
    return this.adminService.getReviewQueue(query.page ?? 1, query.limit ?? 20);
  }

  @Patch('review-queue/:id/resolve')
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  async resolveReviewItem(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() body: ResolveReviewItemDto,
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
  async runLiveIngestion(@Body() body: RunLiveIngestionDto) {
    const { platformSlugs, limitPerQuery } = body;

    // A full sweep (dozens of scraper requests per platform) can run for minutes —
    // queue it instead of blocking the request past the frontend's timeout.
    const jobId = await this.ingestionQueue.enqueueLiveIngestion({ platformSlugs, limitPerQuery });
    return { queued: true, jobId, platformSlugs: platformSlugs ?? [] };
  }

  @Post('reconcile')
  @Roles(UserRole.ADMIN)
  async runReconciliation(@Body() body: RunReconciliationDto) {
    const { dryRun, maxPairs } = body;

    // Scanning the whole catalog + LLM calls per candidate pair can run for a
    // while — queue it rather than block the request.
    const jobId = await this.ingestionQueue.enqueueReconciliation({ dryRun, maxPairs });
    return { queued: true, jobId, dryRun: dryRun ?? 'env-default' };
  }

  @Post('store-coverage-sweep')
  @Roles(UserRole.ADMIN)
  async runStoreCoverageSweep(@Body() body: RunStoreCoverageSweepDto) {
    const { maxProducts } = body;

    // Scrapes every under-covered product's missing stores -- can run for a
    // while, so queue it rather than block the request.
    const jobId = await this.ingestionQueue.enqueueStoreCoverageSweep({ maxProducts });
    return { queued: true, jobId };
  }
}
