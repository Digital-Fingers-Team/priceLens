import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { CurrentUser, Public } from '../common/decorators';
import { ProductsService } from '../products/products.service';
import { EntitlementsService } from '../billing/entitlements.service';

@ApiTags('prices')
@Controller('prices')
export class PricesController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * Price history, clamped to the caller's plan window.
   *
   * Deliberately still @Public: an anonymous visitor gets the free-tier window
   * of *real* data rather than a login wall, which is what makes the product
   * indexable and worth sharing. The response states the window it actually
   * covered and whether it was truncated, so the UI can offer the upgrade
   * honestly instead of silently showing a short chart.
   */
  @Public()
  @Get(':productId/history')
  async getHistory(
    @CurrentUser() user: User | undefined,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('days') days?: string,
  ) {
    const requested = Number(days ?? 90);
    const window = await this.entitlements.resolveHistoryWindow(
      user?.id ?? null,
      Number.isFinite(requested) ? requested : 90,
    );

    const history = await this.productsService.getPriceHistory(productId, window.days);

    return {
      ...history,
      window: {
        requestedDays: Number.isFinite(requested) ? requested : 90,
        days: window.days,
        truncated: window.truncated,
        maxDays: window.maxDays,
      },
    };
  }

  @Public()
  @Get(':productId/current')
  getCurrent(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.productsService.getCurrentPrices(productId);
  }

  @Public()
  @Get(':productId/stats')
  getStats(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.productsService.getPriceStats(productId);
  }
}
