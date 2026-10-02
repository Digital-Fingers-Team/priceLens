import { Module } from '@nestjs/common';
import { ImageSearchController } from './image-search.controller';
import { ImageSearchService } from './image-search.service';

@Module({
  controllers: [ImageSearchController],
  providers: [ImageSearchService],
  exports: [ImageSearchService],
})
export class ImageSearchModule {}
