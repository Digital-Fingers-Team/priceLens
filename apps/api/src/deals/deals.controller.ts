import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { PriceDropsService } from './price-drops.service';

@ApiTags('deals')
@Controller('deals')
export class DealsController {
  constructor(private readonly drops: PriceDropsService) {}

  /** Live prices below the listing's own 30-day median: the public price-drops page. */
  @Public()
  @Get('price-drops')
  priceDrops(@Query('limit') limit?: string, @Query('category') category?: string) {
    return this.drops.list({ limit: limit ? Number(limit) : undefined, category: category || undefined });
  }
}
