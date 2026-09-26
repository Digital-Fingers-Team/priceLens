import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { INGESTION_QUEUE } from '../workers/ingestion.jobs';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [BullModule.registerQueue({ name: INGESTION_QUEUE })],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
