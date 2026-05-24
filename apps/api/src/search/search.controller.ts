import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../common/decorators';
import { ProductsService } from '../products/products.service';

@Controller('search')
export class SearchController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get()
  search(
    @Query('q') q?: string,
    @Query('brand') brand?: string,
    @Query('categoryId') categoryId?: string,
    @Query('tier') tier?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('sortBy') sortBy?: 'minPriceUsd' | 'maxPriceUsd' | 'listingCount' | 'updatedAt',
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.productsService.searchProducts({
      q,
      brand,
      categoryId,
      tier,
      minPrice: minPrice != null && minPrice !== '' ? Number(minPrice) : undefined,
      maxPrice: maxPrice != null && maxPrice !== '' ? Number(maxPrice) : undefined,
      sortBy,
      sortDir,
      page: page != null && page !== '' ? Number(page) : undefined,
      limit: limit != null && limit !== '' ? Number(limit) : undefined,
    });
  }

  @Public()
  @Get('suggest')
  suggest(@Query('q') q = '', @Query('limit') limit?: string) {
    return this.productsService.suggest(q, limit != null && limit !== '' ? Number(limit) : 6);
  }
}
