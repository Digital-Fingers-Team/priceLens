import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { FEATURES } from '../billing/plan-limits';
import { RequiresFeature } from '../billing/requires-feature.decorator';
import { FxTrackingService } from './fx-tracking.service';
import { ImportFinderService } from './import-finder.service';
import { TrendRadarService } from './trend-radar.service';
import { BuildTrendRadarDto, FxHistoryQuery, OpportunitiesQuery, TrendRadarQuery } from './dto/trade.dto';

/** Importer & trader tools (Seller Plus): import finder, FX tracking, trend radar. */
@ApiTags('trade')
@Controller()
export class TradeController {
  constructor(
    private readonly importFinder: ImportFinderService,
    private readonly fx: FxTrackingService,
    private readonly radar: TrendRadarService,
  ) {}

  @RequiresFeature(FEATURES.IMPORT_FINDER)
  @Get('trade/import-opportunities')
  opportunities(@Query() query: OpportunitiesQuery) {
    return this.importFinder.list(query);
  }

  /** Today's rates are public: the history and the impact on products are the paid part. */
  @Public()
  @Get('trade/fx/rates')
  rates() {
    return this.fx.latest();
  }

  @RequiresFeature(FEATURES.FX_TRACKING)
  @Get('trade/fx/history')
  history(@Query() query: FxHistoryQuery) {
    return this.fx.history(query.currency ?? 'USD', query.days ?? 90);
  }

  @RequiresFeature(FEATURES.FX_TRACKING)
  @Get('trade/fx/impact')
  impact(@CurrentUser() user: User) {
    return this.fx.impact(user.id);
  }

  @RequiresFeature(FEATURES.TREND_RADAR)
  @Get('trade/trend-radar')
  trendRadar(@Query() query: TrendRadarQuery) {
    return this.radar.get(query.week);
  }

  // ── Admin: run a job now instead of waiting for its schedule ──
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Post('admin/trade/fx/refresh')
  refreshFx() {
    return this.fx.refresh();
  }

  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Post('admin/trade/import-opportunities/rebuild')
  rebuildOpportunities() {
    return this.importFinder.rebuild();
  }

  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Post('admin/trade/trend-radar/build')
  buildRadar(@Body() dto: BuildTrendRadarDto) {
    return this.radar.build(dto.week);
  }
}
