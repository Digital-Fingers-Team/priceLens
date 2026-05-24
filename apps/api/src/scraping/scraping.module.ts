import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MatchingModule } from '../matching/matching.module';
import { BestBuyConnector } from './bestbuy.connector';
import { AmazonConnector } from './connectors/amazon.connector';
import { AlibabaConnector } from './connectors/alibaba.connector';
import { NoonConnector } from './connectors/noon.connector';
import { JumiaConnector } from './connectors/jumia.connector';
import { CarrefourConnector } from './connectors/carrefour.connector';
import { LiveIngestionService } from './live-ingestion.service';

@Module({
  imports: [DatabaseModule, MatchingModule],
  providers: [
    BestBuyConnector,
    AmazonConnector,
    AlibabaConnector,
    NoonConnector,
    JumiaConnector,
    CarrefourConnector,
    LiveIngestionService,
  ],
  exports: [
    BestBuyConnector,
    AmazonConnector,
    AlibabaConnector,
    NoonConnector,
    JumiaConnector,
    CarrefourConnector,
    LiveIngestionService,
  ],
})
export class ScrapingModule {}
