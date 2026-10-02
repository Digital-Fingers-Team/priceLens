import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { PricesModule } from '../prices/prices.module';
import { BuyerModule } from '../buyer/buyer.module';
import { UsedMarketModule } from '../used-market/used-market.module';
import { SellerToolsModule } from '../seller-tools/seller-tools.module';
import { ConfigService } from '@nestjs/config';
import { AffiliateModule } from '../affiliate/affiliate.module';
import { AFFILIATE_CONVERSION_QUEUE } from '../affiliate/affiliate.constants';
import { AffiliateConversionProcessor } from '../affiliate/affiliate-conversion.processor';
import { AffiliateConversionScheduler } from '../affiliate/affiliate-conversion.scheduler';
import { ScrapingModule } from '../scraping/scraping.module';
import { MatchingModule } from '../matching/matching.module';
import { WatchlistModule } from '../watchlist/watchlist.module';
import { SellerModule } from '../seller/seller.module';
import { BrandModule } from '../brand/brand.module';
import { INGESTION_QUEUE } from './ingestion.jobs';
import { IngestionProcessor } from './ingestion.processor';
import { IngestionScheduler } from './ingestion.scheduler';
import { ScrapeSlots } from './scrape-slots';
import { WorkerMemoryGuard } from './worker-memory-guard';

/**
 * Everything that consumes jobs: Bull processors, the schedulers that register
 * repeatable jobs, and (through ScrapingModule) the scraping browsers.
 * AppModule imports this only when PROCESS_ROLE is worker or all (ADR 0004).
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: INGESTION_QUEUE }, { name: AFFILIATE_CONVERSION_QUEUE }),
    ScrapingModule,
    MatchingModule,
    WatchlistModule,
    SellerModule,
    BrandModule,
    AffiliateModule,
    PricesModule,
    BuyerModule,
    UsedMarketModule,
    SellerToolsModule,
  ],
  providers: [
    IngestionProcessor,
    IngestionScheduler,
    AffiliateConversionProcessor,
    AffiliateConversionScheduler,
    WorkerMemoryGuard,
    {
      provide: ScrapeSlots,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new ScrapeSlots(config.get<number>('retailers.scrapeConcurrency', 2)),
    },
  ],
})
export class WorkersModule {}
