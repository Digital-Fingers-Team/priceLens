import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DealsController } from './deals.controller';
import { DealsPostService } from './deals-post.service';
import { PriceDropsService } from './price-drops.service';

@Module({
  imports: [DatabaseModule],
  controllers: [DealsController],
  providers: [PriceDropsService, DealsPostService],
  exports: [PriceDropsService, DealsPostService],
})
export class DealsModule {}
