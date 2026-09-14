import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IntelligenceController } from './intelligence.controller';
import { PriceIntelligenceService } from './price-intelligence.service';

@Module({
  imports: [DatabaseModule],
  controllers: [IntelligenceController],
  providers: [PriceIntelligenceService],
  exports: [PriceIntelligenceService],
})
export class IntelligenceModule {}
