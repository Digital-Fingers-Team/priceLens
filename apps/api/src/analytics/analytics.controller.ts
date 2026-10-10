import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { Public, Roles } from '../common/decorators';
import { SkipCsrf } from '../common/guards/csrf.guard';
import { AnalyticsService } from './analytics.service';
import { AnalyticsSummaryQueryDto, RecordDurationDto, RecordPageViewDto } from './dto/analytics.dto';
import { deviceOf, isBotUserAgent, parsePagePath, referrerHost } from './page-path';

/**
 * Site analytics (owner, 2026-09-29). The web tracker posts a view when a
 * page opens and its visible time when the page is left; both are public
 * beacons that act on no session, hence no CSRF check. The admin dashboard
 * reads the summary.
 */
@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('views')
  @HttpCode(204)
  @ApiOperation({ summary: 'Record a page view (web tracker)' })
  async recordView(@Body() body: RecordPageViewDto, @Req() req: Request): Promise<void> {
    const userAgent = req.headers['user-agent'];
    if (isBotUserAgent(userAgent)) return;
    const page = parsePagePath(body.path);
    if (!page) return;
    await this.analytics.recordView({
      ...page,
      id: body.id,
      visitorId: body.visitorId,
      sessionId: body.sessionId,
      referrerHost: referrerHost(body.referrer, req.headers.host),
      device: deviceOf(userAgent),
    });
  }

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Post('views/:id/duration')
  @HttpCode(204)
  @ApiOperation({ summary: 'Record how long a viewed page was visible (web tracker)' })
  async recordDuration(@Param('id', ParseUUIDPipe) id: string, @Body() body: RecordDurationDto): Promise<void> {
    await this.analytics.recordDuration(id, body.durationMs, body.searchTotal);
  }

  @Get('summary')
  @Roles(UserRole.MODERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Visitors, time on pages, searches, products, accounts and favorites (admin)' })
  summary(@Query() query: AnalyticsSummaryQueryDto) {
    return this.analytics.summary(query.days ?? 30);
  }
}
