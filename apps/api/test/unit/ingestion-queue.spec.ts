import type { Queue } from 'bull';
import { IngestionQueue } from '../../src/workers/ingestion-queue.service';
import {
  RUN_LIVE_INGESTION_JOB,
  RUN_QUERY_INGESTION_JOB,
  RUN_RECONCILIATION_JOB,
  RUN_STORE_COVERAGE_SWEEP_JOB,
  RUN_STORE_EXPANSION_JOB,
} from '../../src/workers/ingestion.jobs';

function fakeQueue() {
  const add = jest.fn(async () => ({ id: 42 }));
  return { queue: { add } as unknown as Queue, add };
}

const ON_DEMAND = { removeOnComplete: true, removeOnFail: true };

describe('IngestionQueue (producer)', () => {
  it('deduplicates on-demand scrapes per query and per product', async () => {
    const { queue, add } = fakeQueue();
    const producer = new IngestionQueue(queue);

    await producer.enqueueQueryIngestion('iphone 16', 12);
    await producer.enqueueStoreExpansion('p-1', 4);

    expect(add).toHaveBeenNthCalledWith(1, RUN_QUERY_INGESTION_JOB, { query: 'iphone 16', limitPerQuery: 12 }, {
      jobId: 'on-demand-live-fetch:iphone 16',
      ...ON_DEMAND,
    });
    expect(add).toHaveBeenNthCalledWith(2, RUN_STORE_EXPANSION_JOB, { productId: 'p-1', targetStores: 4 }, {
      jobId: 'store-expansion:p-1',
      ...ON_DEMAND,
    });
  });

  it('enqueues admin runs and returns the job id', async () => {
    const { queue, add } = fakeQueue();
    const producer = new IngestionQueue(queue);

    expect(await producer.enqueueLiveIngestion({ platformSlugs: ['noon', 'jumia'] })).toBe('42');
    expect(add).toHaveBeenLastCalledWith(RUN_LIVE_INGESTION_JOB, { platformSlugs: ['noon', 'jumia'] }, {
      jobId: 'manual-live-fetch:noon,jumia',
      ...ON_DEMAND,
    });

    await producer.enqueueLiveIngestion({});
    expect(add).toHaveBeenLastCalledWith(RUN_LIVE_INGESTION_JOB, {}, { jobId: 'manual-live-fetch:all', ...ON_DEMAND });

    await producer.enqueueReconciliation({ dryRun: true });
    expect(add).toHaveBeenLastCalledWith(
      RUN_RECONCILIATION_JOB,
      { dryRun: true },
      expect.objectContaining({ jobId: expect.stringMatching(/^manual-reconcile:\d+$/), ...ON_DEMAND }),
    );

    await producer.enqueueStoreCoverageSweep({ maxProducts: 5 });
    expect(add).toHaveBeenLastCalledWith(
      RUN_STORE_COVERAGE_SWEEP_JOB,
      { maxProducts: 5 },
      expect.objectContaining({ jobId: expect.stringMatching(/^manual-store-coverage-sweep:\d+$/), ...ON_DEMAND }),
    );
  });
});
