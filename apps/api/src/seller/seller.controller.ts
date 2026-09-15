import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrgRole, User } from '@prisma/client';
import { CurrentUser } from '../common/decorators';
import { FEATURES } from '../billing/plan-limits';
import { RequiresFeature } from '../billing/requires-feature.decorator';
import { OrganizationsService } from './organizations.service';
import { SellerProductsService } from './seller-products.service';
import { CompetitorEventsService } from './competitor-events.service';
import {
  AddMemberDto,
  CreateOrganizationDto,
  ListEventsQuery,
  UpsertAlertRuleDto,
  UpsertSellerProductDto,
} from './dto/seller.dto';

/**
 * The seller workspace API.
 *
 * Every route below /workspaces/:orgId is scoped through
 * OrganizationsService.requireMembership inside the service layer, so an
 * orgId in the URL is never trusted on its own.
 *
 * Listing and creating workspaces is deliberately NOT feature-gated: a user
 * who downgrades must still be able to see and wind down what they have.
 * The monitoring surfaces are gated individually.
 */
@ApiTags('seller')
@Controller('seller')
export class SellerController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly products: SellerProductsService,
    private readonly events: CompetitorEventsService,
  ) {}

  @Get('workspaces')
  listWorkspaces(@CurrentUser() user: User) {
    return this.organizations.listForUser(user.id);
  }

  @Post('workspaces')
  createWorkspace(@CurrentUser() user: User, @Body() dto: CreateOrganizationDto) {
    return this.organizations.create(user.id, {
      name: dto.name,
      type: dto.type,
      platformId: dto.platformId ?? null,
    });
  }

  @Get('workspaces/:orgId/summary')
  @RequiresFeature(FEATURES.COMPETITOR_MONITORING)
  summary(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.events.summary(user.id, orgId);
  }

  // ─── Members ────────────────────────────────────────────────────────────

  @Get('workspaces/:orgId/members')
  async listMembers(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string) {
    await this.organizations.requireMembership(user.id, orgId);
    return this.organizations.listMembers(orgId);
  }

  /**
   * Not gated on a feature flag: the seat *count* is the limit, and
   * OrganizationsService.addMember already refuses when they are used up.
   * Requiring FEATURES.TEAM_SEATS here locked the Seller plan out of the
   * three seats it pays for, because that flag only exists on Enterprise.
   */
  @Post('workspaces/:orgId/members')
  addMember(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.organizations.addMember(orgId, user.id, dto.email, dto.role as OrgRole);
  }

  @Delete('workspaces/:orgId/members/:memberId')
  async removeMember(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    await this.organizations.removeMember(orgId, user.id, memberId);
    return { ok: true };
  }

  // ─── Products ───────────────────────────────────────────────────────────

  @Get('workspaces/:orgId/products')
  @RequiresFeature(FEATURES.COMPETITOR_MONITORING)
  listProducts(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.products.list(user.id, orgId, {
      search,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('workspaces/:orgId/products/:productId')
  @RequiresFeature(FEATURES.COMPETITOR_MONITORING)
  getProduct(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.products.getOne(user.id, orgId, productId);
  }

  @Put('workspaces/:orgId/products')
  @RequiresFeature(FEATURES.COMPETITOR_MONITORING)
  upsertProduct(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: UpsertSellerProductDto,
  ) {
    return this.products.upsert(user.id, orgId, dto);
  }

  @Delete('workspaces/:orgId/products/:productId')
  async deleteProduct(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    await this.products.remove(user.id, orgId, productId);
    return { ok: true };
  }

  /** Catalogue products this SKU might be. Mapping unlocks everything else. */
  @Get('workspaces/:orgId/products/:productId/match-suggestions')
  @RequiresFeature(FEATURES.COMPETITOR_MONITORING)
  suggestMatches(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.products.suggestMatches(user.id, orgId, productId);
  }

  // ─── Competitor events ──────────────────────────────────────────────────

  @Get('workspaces/:orgId/events')
  @RequiresFeature(FEATURES.COMPETITOR_ALERTS)
  listEvents(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query() query: ListEventsQuery,
  ) {
    return this.events.list(user.id, orgId, query);
  }

  @Post('workspaces/:orgId/events/:eventId/acknowledge')
  acknowledgeEvent(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.events.acknowledge(user.id, orgId, eventId);
  }

  @Post('workspaces/:orgId/events/acknowledge-all')
  acknowledgeAll(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.events.acknowledgeAll(user.id, orgId);
  }

  // ─── Alert rules ────────────────────────────────────────────────────────

  @Get('workspaces/:orgId/alert-rules')
  @RequiresFeature(FEATURES.COMPETITOR_ALERTS)
  listRules(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.events.listRules(user.id, orgId);
  }

  @Put('workspaces/:orgId/alert-rules')
  @RequiresFeature(FEATURES.COMPETITOR_ALERTS)
  upsertRule(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: UpsertAlertRuleDto,
  ) {
    return this.events.upsertRule(user.id, orgId, dto);
  }

  @Delete('workspaces/:orgId/alert-rules/:ruleId')
  async deleteRule(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
  ) {
    await this.events.deleteRule(user.id, orgId, ruleId);
    return { ok: true };
  }
}
