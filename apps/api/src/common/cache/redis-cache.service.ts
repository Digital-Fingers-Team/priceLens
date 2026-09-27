import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { reconnectDelay, throttledErrorLogger } from '../redis-resilience';

/**
 * The API's cache (search pages, entitlements): JSON values in Redis with a
 * per-key time to live.
 *
 * It replaced @nestjs/cache-manager + cache-manager-ioredis-yet at the Nest 11
 * upgrade (audit 11): the cache-manager line for Nest 11 moves to Keyv stores
 * on a different Redis client, while this needs three commands. It keeps the
 * same ioredis client, options and stored format (JSON, PX expiry), so the
 * failure handling tuned in phase 03 (B-01) is unchanged and entries written
 * before the upgrade still read.
 *
 * The cache is optional: with Redis down a call fails fast (no offline queue,
 * 1 s command timeout) and callers fall back to Postgres.
 */
@Injectable()
export class RedisCacheService implements OnApplicationShutdown {
  private readonly logger = new Logger('RedisCache');
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis({
      host: config.get<string>('redis.host'),
      port: config.get<number>('redis.port'),
      password: config.get<string>('redis.password'),
      db: config.get<number>('redis.db', 0),
      enableOfflineQueue: false,
      commandTimeout: 1000,
      maxRetriesPerRequest: 1,
      retryStrategy: reconnectDelay,
    });
    // Without a listener ioredis prints "Unhandled error event" on every
    // reconnect attempt (B-01).
    this.client.on('error', throttledErrorLogger(this.logger, 'Cache Redis connection error'));
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }

  /** `ttlMs` is milliseconds, as with cache-manager. */
  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'PX', ttlMs);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  /**
   * Closes the client, so a test run or a deploy's graceful stop is not held
   * open by it. quit() waits for Redis to answer; with Redis gone that never
   * happens, so a client that is not ready is dropped instead.
   */
  async onApplicationShutdown(): Promise<void> {
    if (this.client.status === 'ready') {
      await this.client.quit();
    } else {
      this.client.disconnect();
    }
  }
}
