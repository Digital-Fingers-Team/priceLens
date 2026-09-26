import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.productsService.getBySlug(slug);
  }

  @Public()
  @Get(':id/listings')
  getListings(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.productsService.getListings(id, Number(page ?? 1), Number(limit ?? 50));
  }
}
