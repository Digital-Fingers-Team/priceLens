import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { CompetitorEventType } from '@prisma/client';
import { Public } from '../common/decorators';
import { ApiKeyGuard, ApiKeyRequest, RequiresApiScope } from './api-key.guard';
import { MarketDataService } from './market-data.service';
import { MarketQueryDto } from './dto/public-api.dto';

/**
 * The enterprise API.
 *
 * @Public only in the sense that it does not take a JWT — ApiKeyGuard is the
 * authentication, and it fails closed. @SkipThrottle because quota is enforced
 * per key by the guard; the shared IP throttle would otherwise punish a
 * customer for their neighbours' traffic.
 *
 * Responses use snake_case, unlike the rest of the app: this is a published
 * contract that integrators pin against, and it should look like the REST API
 * it is rather than leaking our internal casing.
 *
 * Mounted at /api/v1/partner rather than /api/v1: the app already applies a
 * global api/v1 prefix, so a 'v1' controller path would publish
 * /api/v1/v1/..., and mounting at the root would put key-authenticated routes
 * on the same prefix as the session-authenticated ones.
 */
@ApiExcludeController()
@Controller('partner')
@Public()
@SkipThrottle()
@UseGuards(ApiKeyGuard)
export class PublicApiController {
  constructor(private readonly marketData: MarketDataService) {}

  /** GET /api/v1/partner/products/{sku}/market */
  @Get('products/:sku/market')
  @RequiresApiScope('market:read')
  getProductMarket(@Param('sku') sku: string, @Query() query: MarketQueryDto) {
    return this.marketData.getProductMarket(sku, query.days ?? 90);
  }

  @Get('market/stats')
  @RequiresApiScope('market:read')
  getMarketStats(@Query('brand') brand?: string, @Query('category') category?: string) {
    return this.marketData.getMarketStats({ brand, categorySlug: category });
  }

  /**
   * The calling workspace's own competitor events.
   *
   * Scoped to the key's organisation, never to a caller-supplied id — an API
   * key must not be able to read another workspace's data by changing a query
   * parameter.
   */
  @Get('events')
  @RequiresApiScope('events:read')
  listEvents(
    @Req() request: ApiKeyRequest,
    @Query('type') type?: CompetitorEventType,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    return this.marketData.listCompetitorEvents(request.apiKey!.orgId, { type, since, limit });
  }

  /** Lets an integrator confirm a key works and see its remaining quota. */
  @Get('whoami')
  whoami(@Req() request: ApiKeyRequest) {
    const resolved = request.apiKey!;
    return {
      organization_id: resolved.orgId,
      key_prefix: resolved.apiKey.keyPrefix,
      scopes: resolved.scopes,
      daily_limit: resolved.dailyLimit,
    };
  }
}
