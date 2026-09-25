import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ScrapingModule } from '../scraping/scraping.module';
import { MatchingModule } from '../matching/matching.module';
import { WatchlistModule } from '../watchlist/watchlist.module';
import { SellerModule } from '../seller/seller.module';
import { BrandModule } from '../brand/brand.module';
import { INGESTION_QUEUE } from './ingestion.jobs';
import { IngestionProcessor } from './ingestion.processor';
import { IngestionScheduler } from './ingestion.scheduler';

@Module({
  imports: [
    BullModule.registerQueue({ name: INGESTION_QUEUE }),
    ScrapingModule,
    MatchingModule,
    WatchlistModule,
    SellerModule,
    BrandModule,
  ],
  providers: [IngestionProcessor, IngestionScheduler],
})
export class WorkersModule {}
