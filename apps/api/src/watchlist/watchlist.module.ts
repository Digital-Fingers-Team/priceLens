import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { WatchlistController } from './watchlist.controller';
import { WatchlistService } from './watchlist.service';
import { PriceAlertService } from './price-alert.service';

@Module({
  imports: [DatabaseModule],
  controllers: [WatchlistController],
  providers: [WatchlistService, PriceAlertService],
  exports: [PriceAlertService],
})
export class WatchlistModule {}
