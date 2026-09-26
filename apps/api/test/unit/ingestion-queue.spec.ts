import type { Queue } from 'bull';
import { ENQUEUE_TIMEOUT_MS, IngestionQueue, JOB_PRIORITY } from '../../src/workers/ingestion-queue.service';
import { RedisTimeoutError } from '../../src/common/redis-resilience';
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
      priority: JOB_PRIORITY.userSearch,
      ...ON_DEMAND,
    });
    expect(add).toHaveBeenNthCalledWith(2, RUN_STORE_EXPANSION_JOB, { productId: 'p-1', targetStores: 4 }, {
      jobId: 'store-expansion:p-1',
      priority: JOB_PRIORITY.storeExpansion,
      ...ON_DEMAND,
    });
  });

  it('runs a shopper search before background store expansions', () => {
    expect(JOB_PRIORITY.userSearch).toBeLessThan(JOB_PRIORITY.admin);
    expect(JOB_PRIORITY.admin).toBeLessThan(JOB_PRIORITY.storeExpansion);
  });

  it('enqueues admin runs and returns the job id', async () => {
    const { queue, add } = fakeQueue();
    const producer = new IngestionQueue(queue);

    expect(await producer.enqueueLiveIngestion({ platformSlugs: ['noon', 'jumia'] })).toBe('42');
    expect(add).toHaveBeenLastCalledWith(RUN_LIVE_INGESTION_JOB, { platformSlugs: ['noon', 'jumia'] }, {
      jobId: 'manual-live-fetch:noon,jumia',
      priority: JOB_PRIORITY.admin,
      ...ON_DEMAND,
    });

    await producer.enqueueLiveIngestion({});
    expect(add).toHaveBeenLastCalledWith(RUN_LIVE_INGESTION_JOB, {}, { jobId: 'manual-live-fetch:all', priority: JOB_PRIORITY.admin, ...ON_DEMAND });

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

describe('IngestionQueue with Redis unreachable (B-01)', () => {
  it('fails fast instead of hanging the caller', async () => {
    jest.useFakeTimers();
    try {
      const add = jest.fn(() => new Promise(() => undefined)); // Bull waiting for a connection
      const producer = new IngestionQueue({ add } as unknown as Queue);

      const pending = producer.enqueueQueryIngestion('iphone 16', 12);
      jest.advanceTimersByTime(ENQUEUE_TIMEOUT_MS);

      await expect(pending).rejects.toBeInstanceOf(RedisTimeoutError);
    } finally {
      jest.useRealTimers();
    }
  });
});
