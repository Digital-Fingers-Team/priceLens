import type { Queue } from 'bull';
import type { ConfigService } from '@nestjs/config';
import {
  RedisTimeoutError,
  reconnectDelay,
  retryUntilDone,
  throttledErrorLogger,
  withTimeout,
} from '../../src/common/redis-resilience';
import { IngestionScheduler } from '../../src/workers/ingestion.scheduler';

const quietLogger = () => ({ warn: jest.fn(), log: jest.fn(), error: jest.fn() });

describe('redis resilience helpers (B-01)', () => {
  it('withTimeout passes a result through and rejects a hung promise', async () => {
    await expect(withTimeout(Promise.resolve(7), 50, 'x')).resolves.toBe(7);
    await expect(withTimeout(new Promise(() => undefined), 10, 'ping')).rejects.toBeInstanceOf(RedisTimeoutError);
  });

  it('reconnectDelay grows and is capped at 10 s', () => {
    expect(reconnectDelay(1)).toBe(500);
    expect(reconnectDelay(4)).toBe(2000);
    expect(reconnectDelay(1000)).toBe(10_000);
  });

  it('retryUntilDone retries with doubling delays until the task succeeds', async () => {
    const delays: number[] = [];
    let calls = 0;
    const logger = quietLogger();

    await retryUntilDone(
      async () => {
        calls++;
        if (calls < 4) throw new Error('ECONNREFUSED');
      },
      { label: 'register', logger, initialDelayMs: 100, maxDelayMs: 300, sleep: async (ms) => void delays.push(ms) },
    );

    expect(calls).toBe(4);
    expect(delays).toEqual([100, 200, 300]);
    expect(logger.log).toHaveBeenCalledWith('register succeeded on attempt 4');
  });

  it('retryUntilDone stops when told to', async () => {
    let stopped = false;
    let calls = 0;
    await retryUntilDone(
      async () => {
        calls++;
        stopped = true;
        throw new Error('down');
      },
      { label: 'register', logger: quietLogger(), isStopped: () => stopped, sleep: async () => undefined },
    );
    expect(calls).toBe(1);
  });

  it('throttledErrorLogger logs each distinct error once per window', () => {
    const logger = quietLogger();
    const onError = throttledErrorLogger(logger, 'Cache Redis', 60_000);
    for (let i = 0; i < 50; i++) onError(new Error('connect ECONNREFUSED 127.0.0.1:6390'));
    onError(new Error('NOAUTH'));
    expect(logger.error).toHaveBeenCalledTimes(2);
  });
});

describe('IngestionScheduler bootstrap with Redis unreachable (B-01)', () => {
  it('returns immediately instead of waiting for Redis', () => {
    // Bull queues commands until Redis connects: they never settle.
    const hung = () => new Promise<never>(() => undefined);
    const queue = { getRepeatableJobs: jest.fn(hung), add: jest.fn(hung) } as unknown as Queue;
    const config = { get: (_key: string, fallback: unknown) => fallback } as unknown as ConfigService;
    const scheduler = new IngestionScheduler(queue, config);

    const started = Date.now();
    const result = scheduler.onApplicationBootstrap();
    expect(result).toBeUndefined(); // nothing for Nest to await
    expect(Date.now() - started).toBeLessThan(50);
    expect(queue.getRepeatableJobs).toHaveBeenCalled();

    scheduler.onApplicationShutdown();
  });
});
