// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bull';

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
import { AffiliateModule } from './affiliate/affiliate.module';
import { BillingModule } from './billing/billing.module';
import { NotificationsModule } from './notifications/notifications.module';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { DealHunterModule } from './deal-hunter/deal-hunter.module';
import { SellerModule } from './seller/seller.module';
import { BrandModule } from './brand/brand.module';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import authConfig from './config/auth.config';
import searchConfig from './config/search.config';
import retailersConfig from './config/retailers.config';
import pricingConfig from './config/pricing.config';
import affiliateConfig from './config/affiliate.config';
import billingConfig from './config/billing.config';
import notificationsConfig from './config/notifications.config';

@Module({
  imports: [
    // ─── Config ────────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        databaseConfig,
        redisConfig,
        authConfig,
        searchConfig,
        retailersConfig,
        pricingConfig,
        affiliateConfig,
        billingConfig,
        notificationsConfig,
      ],
      // Shared with apps/web from the repo root — see /.env.example
      envFilePath: ['../../.env.local', '../../.env'],
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
    AffiliateModule,
    // Billing and Notifications are @Global and are imported before the
    // feature modules that depend on them.
    BillingModule,
    NotificationsModule,
    IntelligenceModule,
    DealHunterModule,
    SellerModule,
    BrandModule,
  ],
  providers: [
    // ThrottlerModule only supplies configuration — without the guard actually
    // registered, every @Throttle decorator in the app is inert and endpoints
    // like login and the scrape-triggering search are unthrottled.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // FeatureGuard (@RequiresFeature) is registered in AuthModule, directly
    // after JwtAuthGuard -- it needs request.user, so it must not run before
    // authentication has populated it.
  ],
})
export class AppModule {}
