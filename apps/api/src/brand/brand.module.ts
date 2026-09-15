import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SellerModule } from '../seller/seller.module';
import { BrandController } from './brand.controller';
import { DistributionService } from './distribution.service';
import { LaunchDetectionService } from './launch-detection.service';
import { MapMonitoringService } from './map-monitoring.service';
import { MarketReportsService } from './market-reports.service';

@Module({
  // SellerModule supplies OrganizationsService: brand workspaces are the same
  // tenancy model with a different type, not a parallel one.
  imports: [DatabaseModule, SellerModule],
  controllers: [BrandController],
  providers: [MapMonitoringService, DistributionService, LaunchDetectionService, MarketReportsService],
  exports: [MapMonitoringService, LaunchDetectionService, MarketReportsService],
})
export class BrandModule {}
