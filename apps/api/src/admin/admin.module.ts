import { Module } from '@nestjs/common';
import { ScrapingModule } from '../scraping/scraping.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [ScrapingModule],
  controllers: [AdminController],
})
export class AdminModule {}
