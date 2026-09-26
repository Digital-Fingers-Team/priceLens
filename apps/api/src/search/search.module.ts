import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { IngestionQueueModule } from '../workers/ingestion-queue.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [ProductsModule, IngestionQueueModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
