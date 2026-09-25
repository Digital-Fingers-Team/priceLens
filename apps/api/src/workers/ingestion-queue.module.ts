import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { INGESTION_QUEUE } from './ingestion.jobs';
import { IngestionQueue } from './ingestion-queue.service';

/** Lets HTTP-side modules enqueue ingestion jobs without depending on the workers. */
@Module({
  imports: [BullModule.registerQueue({ name: INGESTION_QUEUE })],
  providers: [IngestionQueue],
  exports: [IngestionQueue],
})
export class IngestionQueueModule {}
