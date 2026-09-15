import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators';
import { FEATURES } from '../billing/plan-limits';
import { RequiresFeature } from '../billing/requires-feature.decorator';
import { PriceIntelligenceService } from './price-intelligence.service';

@ApiTags('intelligence')
@Controller('intelligence')
export class IntelligenceController {
  constructor(private readonly intelligence: PriceIntelligenceService) {}

  /**
   * The full intelligence panel for a product.
   *
   * Authenticated but not feature-gated: the history window is already
   * clamped per plan inside the service, so a free user gets a real (shorter)
   * answer rather than a locked panel. That is the funnel — showing a genuine
   * 30-day verdict is what makes the 365-day one worth paying for.
   */
  @Get('products/:productId')
  getProductIntelligence(
    @CurrentUser() user: User,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('days') days?: string,
  ) {
    const requested = Number(days ?? 90);
    return this.intelligence.getProductIntelligence(
      productId,
      user?.id ?? null,
      Number.isFinite(requested) ? requested : 90,
    );
  }

  /** The Buy/Wait call on its own, for compact placements like cards. */
  @RequiresFeature(FEATURES.BUY_VERDICT)
  @Get('products/:productId/verdict')
  async getVerdict(@CurrentUser() user: User, @Param('productId', ParseUUIDPipe) productId: string) {
    const result = await this.intelligence.getProductIntelligence(productId, user.id, 90);
    return { verdict: result.verdict, market: result.market, currency: result.currency };
  }

  @RequiresFeature(FEATURES.FAKE_SALE_DETECTION)
  @Get('products/:productId/discount-check')
  async getDiscountCheck(@CurrentUser() user: User, @Param('productId', ParseUUIDPipe) productId: string) {
    const result = await this.intelligence.getProductIntelligence(productId, user.id, 180);
    return { discountCheck: result.discountCheck, currency: result.currency };
  }
}
