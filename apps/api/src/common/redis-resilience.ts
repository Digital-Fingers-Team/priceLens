import type { Logger } from '@nestjs/common';

/**
 * Helpers that keep a slow or missing Redis from taking the API down (B-01).
 * ioredis queues commands while it is disconnected, so an unguarded await on
 * Redis never settles; everything on a request path or in bootstrap goes
 * through one of these instead.
 */

export class RedisTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms (Redis unavailable?)`);
    this.name = 'RedisTimeoutError';
  }
}

/** Rejects with RedisTimeoutError when `promise` has not settled within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RedisTimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Reconnect delay for ioredis: grows with each attempt, capped at 10 s, never gives up. */
export function reconnectDelay(attempt: number): number {
  return Math.min(attempt * 500, 10_000);
}

/**
 * Runs `task` until it succeeds, waiting longer after each failure (capped at
 * `maxDelayMs`). Used for work that needs Redis but must not block bootstrap,
 * such as registering repeatable jobs. Stops when `isStopped()` turns true.
 */
export async function retryUntilDone(
  task: () => Promise<void>,
  options: {
    label: string;
    logger: Pick<Logger, 'warn' | 'log'>;
    attemptTimeoutMs?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    isStopped?: () => boolean;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<void> {
  const {
    label,
    logger,
    attemptTimeoutMs = 10_000,
    initialDelayMs = 1_000,
    maxDelayMs = 60_000,
    isStopped = () => false,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref()),
  } = options;

  let delay = initialDelayMs;
  for (let attempt = 1; !isStopped(); attempt++) {
    try {
      await withTimeout(task(), attemptTimeoutMs, label);
      if (attempt > 1) logger.log(`${label} succeeded on attempt ${attempt}`);
      return;
    } catch (error) {
      logger.warn(`${label} failed (attempt ${attempt}): ${(error as Error).message}; retrying in ${delay}ms`);
      await sleep(delay);
      delay = Math.min(delay * 2, maxDelayMs);
    }
  }
}

/**
 * One log line per distinct error per minute, instead of one per reconnect
 * attempt ("[ioredis] Unhandled error event" floods the log otherwise).
 */
export function throttledErrorLogger(logger: Pick<Logger, 'error'>, label: string, windowMs = 60_000) {
  const lastLogged = new Map<string, number>();
  return (error: Error) => {
    const key = error.message;
    const now = Date.now();
    if ((lastLogged.get(key) ?? 0) + windowMs > now) return;
    lastLogged.set(key, now);
    logger.error(`${label}: ${error.message}`);
  };
}
