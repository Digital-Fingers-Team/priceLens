// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bull';
import { createClient } from 'ioredis';

import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { SearchModule } from './search/search.module';
import { MatchingModule } from './matching/matching.module';
import { ScrapingModule } from './scraping/scraping.module';
import { AdminModule } from './admin/admin.module';
import { WatchlistModule } from './watchlist/watchlist.module';
import { PricesModule } from './prices/prices.module';
import { WorkersModule } from './workers/workers.module';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import authConfig from './config/auth.config';
import searchConfig from './config/search.config';

@Module({
  imports: [
    // ─── Config ────────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, authConfig, searchConfig],
      envFilePath: ['.env.local', '.env'],
      cache: true,
    }),

    // ─── Rate Limiting ──────────────────────────────────────────────────────
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: config.get<number>('app.throttleTtl', 60000),
          limit: config.get<number>('app.throttleLimit', 100),
        },
      ],
    }),

    // ─── Cache (Redis) ──────────────────────────────────────────────────────
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        store: (await import('cache-manager-ioredis-yet')).redisStore,
        host: config.get('redis.host'),
        port: config.get('redis.port'),
        password: config.get('redis.password'),
        db: config.get('redis.db', 0),
        ttl: 300, // default 5 min cache TTL
      }),
    }),

    // ─── BullMQ (Job Queue) ─────────────────────────────────────────────────
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password'),
          db: 1, // use db 1 for queues, db 0 for cache
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      }),
    }),

    // ─── Feature Modules ────────────────────────────────────────────────────
    DatabaseModule,
    AuthModule,
    ProductsModule,
    SearchModule,
    MatchingModule,
    ScrapingModule,
    AdminModule,
    WatchlistModule,
    PricesModule,
    WorkersModule,
  ],
})
export class AppModule {}