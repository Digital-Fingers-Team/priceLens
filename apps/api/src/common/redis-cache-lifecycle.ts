import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { RedisCache } from 'cache-manager-ioredis-yet';
import { throttledErrorLogger } from './redis-resilience';

/**
 * Owns the cache store's ioredis client for its whole life:
 * - logs its connection errors (throttled). Without a listener ioredis prints
 *   "Unhandled error event" on every reconnect attempt (B-01);
 * - closes it on shutdown. CacheModule never does, so after app.close() the
 *   process stayed alive: test runs never exited, and a deploy's graceful stop
 *   waited out the container's kill timeout.
 */
@Injectable()
export class RedisCacheLifecycle implements OnApplicationShutdown {
  private readonly logger = new Logger('RedisCache');

  constructor(@Inject(CACHE_MANAGER) private readonly cache: RedisCache) {
    this.cache.store.client.on('error', throttledErrorLogger(this.logger, 'Cache Redis connection error'));
  }

  async onApplicationShutdown(): Promise<void> {
    // quit() waits for Redis to answer; with Redis gone that never happens.
    const client = this.cache.store.client;
    if (client.status === 'ready') {
      await client.quit();
    } else {
      client.disconnect();
    }
  }
}
