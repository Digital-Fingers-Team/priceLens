import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { RedisCache } from 'cache-manager-ioredis-yet';

/**
 * CacheModule opens an ioredis connection for the cache store but never
 * closes it, so after app.close() the process stays alive: test runs never
 * exit, and a deploy's graceful stop waits out the container's kill timeout.
 */
@Injectable()
export class RedisCacheShutdown implements OnApplicationShutdown {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: RedisCache) {}

  async onApplicationShutdown(): Promise<void> {
    await this.cache.store.client.quit();
  }
}
