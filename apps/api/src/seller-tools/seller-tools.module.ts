import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ScrapingModule } from '../scraping/scraping.module';
import { SellerModule } from '../seller/seller.module';
import { RankTrackingService } from './rank-tracking.service';
import { SellerToolsController } from './seller-tools.controller';
import { SellerToolsService } from './seller-tools.service';

@Module({
  imports: [DatabaseModule, SellerModule, ScrapingModule],
  controllers: [SellerToolsController],
  providers: [SellerToolsService, RankTrackingService],
  exports: [SellerToolsService, RankTrackingService],
})
export class SellerToolsModule {}
