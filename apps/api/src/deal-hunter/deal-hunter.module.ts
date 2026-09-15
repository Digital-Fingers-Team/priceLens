import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { DealHunterController } from './deal-hunter.controller';
import { DealHunterService } from './deal-hunter.service';

@Module({
  imports: [DatabaseModule, IntelligenceModule],
  controllers: [DealHunterController],
  providers: [DealHunterService],
  exports: [DealHunterService],
})
export class DealHunterModule {}
