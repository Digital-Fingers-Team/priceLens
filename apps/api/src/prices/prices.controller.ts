import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Public } from '../common/decorators';
import { ProductsService } from '../products/products.service';

@Controller('prices')
export class PricesController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get(':productId/history')
  getHistory(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('days') days?: string,
  ) {
    return this.productsService.getPriceHistory(productId, Number(days ?? 90));
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
