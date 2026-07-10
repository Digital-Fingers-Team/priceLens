import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MatchingModule } from '../matching/matching.module';
import { AmazonConnector } from './connectors/amazon.connector';
import { AlibabaConnector } from './connectors/alibaba.connector';
import { NoonConnector } from './connectors/noon.connector';
import { JumiaConnector } from './connectors/jumia.connector';
import { CarrefourConnector } from './connectors/carrefour.connector';
import { TwoBConnector } from './connectors/twob.connector';
import { ElarabyConnector } from './connectors/elaraby.connector';
import { LiveIngestionService } from './live-ingestion.service';

@Module({
  imports: [DatabaseModule, MatchingModule],
  providers: [
    AmazonConnector,
    AlibabaConnector,
    NoonConnector,
    JumiaConnector,
    CarrefourConnector,
    TwoBConnector,
    ElarabyConnector,
    LiveIngestionService,
  ],
  exports: [
    AmazonConnector,
    AlibabaConnector,
    NoonConnector,
    JumiaConnector,
    CarrefourConnector,
    TwoBConnector,
    ElarabyConnector,
    LiveIngestionService,
  ],
})
export class ScrapingModule {}
