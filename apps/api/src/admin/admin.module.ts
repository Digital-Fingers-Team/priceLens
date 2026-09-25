import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DatabaseModule } from '../database/database.module';
import { IngestionQueueModule } from '../workers/ingestion-queue.module';

@Module({
  imports: [DatabaseModule, IngestionQueueModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
