import { Module } from '@nestjs/common';
import { DealHunterModule } from '../deal-hunter/deal-hunter.module';
import { AdvisorController } from './advisor.controller';
import { AdvisorService } from './advisor.service';

@Module({
  imports: [DealHunterModule],
  controllers: [AdvisorController],
  providers: [AdvisorService],
})
export class AdvisorModule {}
