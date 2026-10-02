import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../common/decorators';
import { FEATURES } from '../billing/plan-limits';
import { RequiresFeature } from '../billing/requires-feature.decorator';
import { RankTrackingService } from './rank-tracking.service';
import { SellerToolsService } from './seller-tools.service';
import {
  AddRankKeywordDto,
  ImportCsvDto,
  ImportUrlDto,
  ProfitQuery,
  RepricerSettingsDto,
  TimelineQuery,
  UpsertFeeTableDto,
} from './dto/seller-tools.dto';

const PRODUCT = 'seller/workspaces/:orgId/products/:productId';

/** Seller tools. Membership is checked in the services, as in the workspace API. */
@ApiTags('seller')
@Controller()
export class SellerToolsController {
  constructor(
    private readonly tools: SellerToolsService,
    private readonly ranks: RankTrackingService,
  ) {}

  @RequiresFeature(FEATURES.SELLER_WORKSPACE)
  @Post('seller/workspaces/:orgId/import/csv')
  importCsv(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string, @Body() dto: ImportCsvDto) {
    return this.tools.importCsv(user.id, orgId, dto.csv);
  }

  @RequiresFeature(FEATURES.SELLER_WORKSPACE)
  @Post('seller/workspaces/:orgId/import/url')
  importUrl(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string, @Body() dto: ImportUrlDto) {
    return this.tools.importUrl(user.id, orgId, dto);
  }

  @RequiresFeature(FEATURES.PROFIT_CALCULATOR)
  @Get(`${PRODUCT}/profit`)
  profit(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() query: ProfitQuery,
  ) {
    return this.tools.profit(user.id, orgId, productId, query.price);
  }

  @RequiresFeature(FEATURES.BEST_PLATFORM)
  @Get(`${PRODUCT}/best-platform`)
  bestPlatform(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.tools.bestPlatform(user.id, orgId, productId);
  }

  @RequiresFeature(FEATURES.COMPETITOR_MONITORING)
  @Get(`${PRODUCT}/timeline`)
  timeline(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() query: TimelineQuery,
  ) {
    return this.tools.timeline(user.id, orgId, productId, query.days);
  }

  @RequiresFeature(FEATURES.REPRICER_SUGGEST)
  @Get(`${PRODUCT}/repricer`)
  repricer(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.tools.repricerState(user.id, orgId, productId);
  }

  @RequiresFeature(FEATURES.REPRICER_SUGGEST)
  @Put(`${PRODUCT}/repricer`)
  updateRepricer(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: RepricerSettingsDto,
  ) {
    return this.tools.updateRepricer(user.id, orgId, productId, dto);
  }

  @RequiresFeature(FEATURES.REPRICER_SUGGEST)
  @Post(`${PRODUCT}/repricer/apply`)
  apply(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.tools.applySuggestion(user.id, orgId, productId);
  }

  @RequiresFeature(FEATURES.REPRICER_SUGGEST)
  @Get('seller/workspaces/:orgId/repricer/export')
  async exportSuggestions(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return { csv: await this.tools.exportSuggestions(user.id, orgId) };
  }

  @RequiresFeature(FEATURES.RANK_TRACKING)
  @Get('seller/rank-platforms')
  rankPlatforms() {
    return this.ranks.trackablePlatforms();
  }

  @RequiresFeature(FEATURES.RANK_TRACKING)
  @Get(`${PRODUCT}/ranks`)
  listRanks(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.ranks.list(user.id, orgId, productId);
  }

  @RequiresFeature(FEATURES.RANK_TRACKING)
  @Post(`${PRODUCT}/ranks`)
  addRank(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: AddRankKeywordDto,
  ) {
    return this.ranks.add(user.id, orgId, productId, dto);
  }

  @RequiresFeature(FEATURES.RANK_TRACKING)
  @Delete('seller/workspaces/:orgId/ranks/:keywordId')
  async removeRank(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string, @Param('keywordId', ParseUUIDPipe) keywordId: string) {
    await this.ranks.remove(user.id, orgId, keywordId);
    return { ok: true };
  }

  // ── Admin: platform fee tables ──
  @Roles(UserRole.ADMIN)
  @Get('admin/fee-tables')
  listFeeTables() {
    return this.tools.listFeeTables();
  }

  @Roles(UserRole.ADMIN)
  @Put('admin/fee-tables')
  upsertFeeTable(@Body() dto: UpsertFeeTableDto) {
    return this.tools.upsertFeeTable(dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete('admin/fee-tables/:id')
  async deleteFeeTable(@Param('id', ParseUUIDPipe) id: string) {
    await this.tools.deleteFeeTable(id);
    return { ok: true };
  }
}
