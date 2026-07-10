import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScrapingModule } from '../scraping/scraping.module';
import { AdminController } from './admin.controller';
import { INGESTION_QUEUE } from '../workers/ingestion.processor';

@Module({
  imports: [ScrapingModule, BullModule.registerQueue({ name: INGESTION_QUEUE })],
  controllers: [AdminController],
})
export class AdminModule {}
