import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrgRole, ReportPeriod, User } from '@prisma/client';
import { CurrentUser } from '../common/decorators';
import { FEATURES } from '../billing/plan-limits';
import { RequiresFeature } from '../billing/requires-feature.decorator';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../seller/organizations.service';
import { MapMonitoringService } from './map-monitoring.service';
import { DistributionService } from './distribution.service';
import { LaunchDetectionService } from './launch-detection.service';
import { MarketReportsService } from './market-reports.service';
import { DistributionQuery, GenerateReportDto, UpsertBrandWatchDto } from './dto/brand.dto';

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
    private readonly prisma: PrismaService,
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
  async listWatches(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string) {
    await this.organizations.requireMembership(user.id, orgId);
    const watches = await this.prisma.brandWatch.findMany({
      where: { orgId },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return watches.map((watch) => ({
      id: watch.id,
      brand: watch.brand,
      category: watch.category,
      isOwnBrand: watch.isOwnBrand,
      isActive: watch.isActive,
      createdAt: watch.createdAt.toISOString(),
    }));
  }

  @Put('workspaces/:orgId/watches')
  @RequiresFeature(FEATURES.LAUNCH_DETECTION)
  async upsertWatch(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: UpsertBrandWatchDto,
  ) {
    await this.organizations.requireMembership(user.id, orgId, OrgRole.ADMIN);

    // find-then-write: categoryId is nullable and Prisma's compound-unique
    // `where` type will not accept null for it.
    const existing = await this.prisma.brandWatch.findFirst({
      where: { orgId, brand: dto.brand, categoryId: dto.categoryId ?? null },
    });

    const watch = existing
      ? await this.prisma.brandWatch.update({
          where: { id: existing.id },
          data: {
            ...(dto.isOwnBrand != null ? { isOwnBrand: dto.isOwnBrand } : {}),
            ...(dto.isActive != null ? { isActive: dto.isActive } : {}),
          },
        })
      : await this.prisma.brandWatch.create({
          data: {
            orgId,
            brand: dto.brand.trim(),
            categoryId: dto.categoryId ?? null,
            isOwnBrand: dto.isOwnBrand ?? false,
            isActive: dto.isActive ?? true,
          },
        });

    return { id: watch.id, brand: watch.brand, isActive: watch.isActive };
  }

  @Delete('workspaces/:orgId/watches/:watchId')
  async deleteWatch(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('watchId', ParseUUIDPipe) watchId: string,
  ) {
    await this.organizations.requireMembership(user.id, orgId, OrgRole.ADMIN);
    await this.prisma.brandWatch.deleteMany({ where: { id: watchId, orgId } });
    return { ok: true };
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
