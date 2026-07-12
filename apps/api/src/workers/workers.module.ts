import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ScrapingModule } from '../scraping/scraping.module';
import { MatchingModule } from '../matching/matching.module';
import { INGESTION_QUEUE, IngestionProcessor } from './ingestion.processor';
import { IngestionScheduler } from './ingestion.scheduler';

@Module({
  imports: [BullModule.registerQueue({ name: INGESTION_QUEUE }), ScrapingModule, MatchingModule],
  providers: [IngestionProcessor, IngestionScheduler],
})
export class WorkersModule {}
