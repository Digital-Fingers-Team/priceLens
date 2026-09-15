import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { CompetitorDetectionService } from './competitor-detection.service';
import { CompetitorEventsService } from './competitor-events.service';
import { OrganizationsService } from './organizations.service';
import { SellerController } from './seller.controller';
import { SellerProductsService } from './seller-products.service';

@Module({
  imports: [DatabaseModule, IntelligenceModule],
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
