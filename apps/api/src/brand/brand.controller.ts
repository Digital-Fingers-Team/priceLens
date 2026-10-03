import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { OrgRole, ReportPeriod, User } from '@prisma/client';
import { CurrentUser } from '../common/decorators';
import { FEATURES } from '../billing/plan-limits';
import { RequiresFeature } from '../billing/requires-feature.decorator';
import { OrganizationsService } from '../seller/organizations.service';
import { AuthorizedRetailersService } from './authorized-retailers.service';
import { MapMonitoringService } from './map-monitoring.service';
import { DistributionService } from './distribution.service';
import { LaunchDetectionService } from './launch-detection.service';
import { MarketReportsService } from './market-reports.service';
import { DistributionQuery, GenerateReportDto, SetAuthorizedRetailersDto, UpsertBrandWatchDto } from './dto/brand.dto';

/**
 * The brand / manufacturer API.
 *
 * Like the seller routes, every path below /workspaces/:orgId resolves
 * membership in the service layer before touching data.
 */
@ApiTags('brand')
@Controller('brand')
export class BrandController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly map: MapMonitoringService,
    private readonly distribution: DistributionService,
    private readonly launches: LaunchDetectionService,
    private readonly reports: MarketReportsService,
    private readonly authorized: AuthorizedRetailersService,
  ) {}

  // ─── MAP monitoring ─────────────────────────────────────────────────────

  @Get('workspaces/:orgId/map/violations')
  @RequiresFeature(FEATURES.MAP_MONITORING)
  listViolations(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('unacknowledgedOnly') unacknowledgedOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.map.listViolations(user.id, orgId, {
      unacknowledgedOnly: unacknowledgedOnly === 'true',
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('workspaces/:orgId/map/violations.csv')
  @RequiresFeature(FEATURES.MAP_MONITORING)
  async violationsCsv(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Res() res: Response,
  ) {
    const body = await this.map.exportViolationsCsv(user.id, orgId);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="map-violations.csv"' });
    res.send(body);
  }

  // ─── Authorized sellers ─────────────────────────────────────────────────

  @Get('workspaces/:orgId/authorized-retailers')
  @RequiresFeature(FEATURES.DISTRIBUTION_MONITORING)
  listAuthorized(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.authorized.list(user.id, orgId);
  }

  @Put('workspaces/:orgId/authorized-retailers')
  @RequiresFeature(FEATURES.DISTRIBUTION_MONITORING)
  setAuthorized(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: SetAuthorizedRetailersDto,
  ) {
    return this.authorized.setAuthorized(user.id, orgId, dto.platformIds);
  }

  @Get('workspaces/:orgId/unauthorized-sellers')
  @RequiresFeature(FEATURES.DISTRIBUTION_MONITORING)
  listUnauthorized(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.authorized.listUnauthorized(user.id, orgId);
  }

  // ─── Distribution ───────────────────────────────────────────────────────

  @Get('workspaces/:orgId/distribution/summary')
  @RequiresFeature(FEATURES.DISTRIBUTION_MONITORING)
  distributionSummary(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.distribution.getSummary(user.id, orgId);
  }

  @Get('workspaces/:orgId/distribution')
  @RequiresFeature(FEATURES.DISTRIBUTION_MONITORING)
  listDistribution(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query() query: DistributionQuery,
  ) {
    return this.distribution.listDistribution(user.id, orgId, query);
  }

  @Get('workspaces/:orgId/distribution/retailers')
  @RequiresFeature(FEATURES.DISTRIBUTION_MONITORING)
  listRetailers(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.distribution.listRetailers(user.id, orgId);
  }

  /** Listings we have stopped seeing — reported as "not seen since", not "delisted". */
  @Get('workspaces/:orgId/distribution/lapsed')
  @RequiresFeature(FEATURES.DISTRIBUTION_MONITORING)
  listLapsed(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.distribution.listLapsedListings(user.id, orgId);
  }

  // ─── Brand watches and launch detection ─────────────────────────────────

  @Get('workspaces/:orgId/watches')
  @RequiresFeature(FEATURES.LAUNCH_DETECTION)
  listWatches(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.launches.listWatches(user.id, orgId);
  }

  @Put('workspaces/:orgId/watches')
  @RequiresFeature(FEATURES.LAUNCH_DETECTION)
  upsertWatch(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: UpsertBrandWatchDto,
  ) {
    return this.launches.upsertWatch(user.id, orgId, dto);
  }

  @Delete('workspaces/:orgId/watches/:watchId')
  deleteWatch(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('watchId', ParseUUIDPipe) watchId: string,
  ) {
    return this.launches.deleteWatch(user.id, orgId, watchId);
  }

  @Get('workspaces/:orgId/discoveries')
  @RequiresFeature(FEATURES.LAUNCH_DETECTION)
  listDiscoveries(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('limit') limit?: string,
  ) {
    return this.launches.listDiscoveries(user.id, orgId, limit ? Number(limit) : undefined);
  }

  // ─── Reports ────────────────────────────────────────────────────────────

  @Get('workspaces/:orgId/reports')
  @RequiresFeature(FEATURES.MARKET_REPORTS)
  listReports(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.reports.list(user.id, orgId);
  }

  @Get('workspaces/:orgId/reports/:reportId/csv')
  @RequiresFeature(FEATURES.MARKET_REPORTS)
  async reportCsv(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Res() res: Response,
  ) {
    const body = await this.reports.exportCsv(user.id, orgId, reportId);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="market-report.csv"' });
    res.send(body);
  }

  @Get('workspaces/:orgId/reports/:reportId/pdf')
  @RequiresFeature(FEATURES.MARKET_REPORTS)
  async reportPdf(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Res() res: Response,
  ) {
    const body = await this.reports.exportPdf(user.id, orgId, reportId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="market-report.pdf"' });
    res.send(body);
  }

  @Get('workspaces/:orgId/reports/:reportId')
  @RequiresFeature(FEATURES.MARKET_REPORTS)
  getReport(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ) {
    return this.reports.getOne(user.id, orgId, reportId);
  }

  /** Generate on demand. Idempotent for a given period. */
  @Post('workspaces/:orgId/reports')
  @RequiresFeature(FEATURES.MARKET_REPORTS)
  async generateReport(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: GenerateReportDto,
  ) {
    await this.organizations.requireMembership(user.id, orgId, OrgRole.ADMIN);
    return this.reports.generate(orgId, dto.period ?? ReportPeriod.WEEKLY);
  }
}
