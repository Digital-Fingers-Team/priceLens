import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { IngestionQueueModule } from '../workers/ingestion-queue.module';

@Module({
  imports: [DatabaseModule, IngestionQueueModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
