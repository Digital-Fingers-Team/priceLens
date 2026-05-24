import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MatchingModule } from '../matching/matching.module';
import { BestBuyConnector } from './bestbuy.connector';
import { LiveIngestionService } from './live-ingestion.service';

@Module({
  imports: [DatabaseModule, MatchingModule],
  providers: [BestBuyConnector, LiveIngestionService],
  exports: [BestBuyConnector, LiveIngestionService],
})
export class ScrapingModule {}
