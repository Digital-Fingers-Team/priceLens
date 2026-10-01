import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { RequiresFlag } from '../feature-flags/requires-flag.decorator';
import { OPERATIONAL_FLAGS } from '../feature-flags/feature-flags.registry';
import { UsedMarketService } from './used-market.service';

@ApiTags('intelligence')
@Controller('intelligence')
export class UsedMarketController {
  constructor(private readonly usedMarket: UsedMarketService) {}

  /** What it sells for second-hand (a range from classifieds), or null. */
  @Public()
  @RequiresFlag(OPERATIONAL_FLAGS.USED_MARKET)
  @Get('products/:productId/used-price')
  async usedPrice(@Param('productId', ParseUUIDPipe) productId: string) {
    return { range: await this.usedMarket.latest(productId) };
  }
}
