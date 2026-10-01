import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { OpenSooqSource } from './opensooq.source';
import { UsedMarketService } from './used-market.service';
import { UsedMarketController } from './used-market.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [UsedMarketController],
  providers: [UsedMarketService, OpenSooqSource],
  exports: [UsedMarketService],
})
export class UsedMarketModule {}
