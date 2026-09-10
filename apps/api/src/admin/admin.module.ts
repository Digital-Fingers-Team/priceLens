import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScrapingModule } from '../scraping/scraping.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DatabaseModule } from '../database/database.module';
import { INGESTION_QUEUE } from '../workers/ingestion.processor';

@Module({
  imports: [DatabaseModule, ScrapingModule, BullModule.registerQueue({ name: INGESTION_QUEUE })],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
