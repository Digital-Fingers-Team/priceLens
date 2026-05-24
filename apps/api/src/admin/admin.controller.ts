import { Body, Controller, Post } from '@nestjs/common';
import { Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';
import { LiveIngestionService } from '../scraping/live-ingestion.service';

interface RunLiveIngestionBody {
  platformSlugs?: string[];
  limitPerQuery?: number;
}

@Controller('admin')
export class AdminController {
  constructor(private readonly liveIngestionService: LiveIngestionService) {}

  @Post('ingest/live')
  @Roles(UserRole.ADMIN)
  runLiveIngestion(@Body() body: RunLiveIngestionBody = {}) {
    return this.liveIngestionService.runLiveIngestion({
      platformSlugs: Array.isArray(body.platformSlugs) ? body.platformSlugs : undefined,
      limitPerQuery: typeof body.limitPerQuery === 'number' ? body.limitPerQuery : undefined,
    });
  }
}
