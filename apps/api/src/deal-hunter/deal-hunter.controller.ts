import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators';
import { FEATURES } from '../billing/plan-limits';
import { RequiresFeature } from '../billing/requires-feature.decorator';
import { DealHunterService } from './deal-hunter.service';
import { HuntQueryDto } from './dto/deal-hunter.dto';
import { parseQuery } from './constraint-parser';

@ApiTags('deal-hunter')
@Controller('deal-hunter')
export class DealHunterController {
  constructor(private readonly dealHunter: DealHunterService) {}

  /**
   * The Deal Hunter itself.
   *
   * A paid feature: it is the single most expensive read in the consumer
   * product (a history series per candidate), and it is the clearest
   * expression of what the subscription is for.
   *
   * Throttled more tightly than the default because each call fans out to
   * dozens of per-product history queries.
   */
  @RequiresFeature(FEATURES.DEAL_HUNTER)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get()
  hunt(@Query() query: HuntQueryDto) {
    return this.dealHunter.hunt(query.q, query.limit ?? 10);
  }

  /**
   * Shows what the parser understood, without running a search.
   *
   * Public and cheap: it powers live "we read this as ..." feedback as the
   * user types, which is what makes a natural-language box trustworthy rather
   * than a black box. It reveals nothing about pricing.
   */
  @Public()
  @Get('interpret')
  interpret(@Query('q') q = '') {
    return { parsed: parseQuery(q) };
  }
}
