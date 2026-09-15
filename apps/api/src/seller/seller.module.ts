import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CompetitorDetectionService } from './competitor-detection.service';
import { CompetitorEventsService } from './competitor-events.service';
import { OrganizationsService } from './organizations.service';
import { SellerController } from './seller.controller';
import { SellerProductsService } from './seller-products.service';

@Module({
  // No IntelligenceModule: this module only uses the pure helpers in
  // price-statistics.ts, which are plain functions rather than providers.
  imports: [DatabaseModule],
  controllers: [SellerController],
  providers: [
    OrganizationsService,
    SellerProductsService,
    CompetitorEventsService,
    CompetitorDetectionService,
  ],
  exports: [CompetitorDetectionService, OrganizationsService],
})
export class SellerModule {}
