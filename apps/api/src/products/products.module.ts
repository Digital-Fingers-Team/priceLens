import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { DatabaseModule } from '../database/database.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { INGESTION_QUEUE } from '../workers/ingestion.processor';

@Module({
  imports: [DatabaseModule, BullModule.registerQueue({ name: INGESTION_QUEUE })],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
