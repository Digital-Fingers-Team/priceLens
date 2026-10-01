import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IntelligenceController } from './intelligence.controller';
import { PriceIntelligenceService } from './price-intelligence.service';
import { LandedCostService } from './landed-cost.service';
import { LandedCostAdminController } from './landed-cost-admin.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [IntelligenceController, LandedCostAdminController],
  providers: [PriceIntelligenceService, LandedCostService],
  exports: [PriceIntelligenceService, LandedCostService],
})
export class IntelligenceModule {}
