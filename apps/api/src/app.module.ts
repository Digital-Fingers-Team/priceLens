// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';

import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { SearchModule } from './search/search.module';
import { MatchingModule } from './matching/matching.module';
import { AdminModule } from './admin/admin.module';
import { WatchlistModule } from './watchlist/watchlist.module';
import { PricesModule } from './prices/prices.module';
import { WorkersModule } from './workers/workers.module';
import { AffiliateModule } from './affiliate/affiliate.module';
import { BillingModule } from './billing/billing.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { NotificationsModule } from './notifications/notifications.module';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { BuyerModule } from './buyer/buyer.module';
import { UsedMarketModule } from './used-market/used-market.module';
import { SellerToolsModule } from './seller-tools/seller-tools.module';
import { TradeModule } from './trade/trade.module';
import { LlmModule } from './llm/llm.module';
import { ImageSearchModule } from './image-search/image-search.module';
import { AdvisorModule } from './advisor/advisor.module';
import { TelegramBotModule } from './telegram-bot/telegram-bot.module';
import { DealHunterModule } from './deal-hunter/deal-hunter.module';
import { SellerModule } from './seller/seller.module';
import { BrandModule } from './brand/brand.module';
import { ProcurementModule } from './procurement/procurement.module';
import { PublicApiModule } from './public-api/public-api.module';
import { HealthModule } from './health/health.module';
import { AnalyticsModule } from './analytics/analytics.module';
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
import llmConfig from './config/llm.config';
import { resolveEnvFiles } from './config/env-files';
import { validateEnv } from './config/env.validation';
import { RedisCacheModule } from './common/cache/redis-cache.module';
import { WebAwareThrottlerGuard } from './common/guards/web-aware-throttler.guard';
import { processRole, runsWorkers } from './config/process-role';

export const ENV_FILES = resolveEnvFiles();

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
        llmConfig,
        notificationsConfig,
      ],
      // Shared with apps/web from the repo root — see /.env.example and
      // config/env-files.ts for how the file is located.
      envFilePath: ENV_FILES,
      ignoreEnvFile: ENV_FILES.length === 0,
      validate: validateEnv,
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
    RedisCacheModule,

    // ─── BullMQ (Job Queue) ─────────────────────────────────────────────────
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password'),
          db: config.get<number>('redis.queueDb', 1),
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
    FeatureFlagsModule,
    AuthModule,
    ProductsModule,
    CategoriesModule,
    SearchModule,
    MatchingModule,
    AdminModule,
    WatchlistModule,
    PricesModule,
    // Processors, schedulers and browsers only where jobs run (ADR 0004).
    // Evaluated after ConfigModule.forRoot above has loaded the env files.
    ...(runsWorkers(processRole()) ? [WorkersModule] : []),
    AffiliateModule,
    // Billing and Notifications are @Global and are imported before the
    // feature modules that depend on them.
    BillingModule,
    NotificationsModule,
    IntelligenceModule,
    BuyerModule,
    UsedMarketModule,
    SellerToolsModule,
    TradeModule,
    LlmModule,
    ImageSearchModule,
    AdvisorModule,
    TelegramBotModule,
    DealHunterModule,
    SellerModule,
    BrandModule,
    ProcurementModule,
    PublicApiModule,
    HealthModule,
    AnalyticsModule,
  ],
  providers: [
    // ThrottlerModule only supplies configuration — without the guard actually
    // registered, every @Throttle decorator in the app is inert and endpoints
    // like login and the scrape-triggering search are unthrottled.
    // The web's own server-side renders are told apart by a shared token.
    { provide: APP_GUARD, useClass: WebAwareThrottlerGuard },
    // FeatureGuard (@RequiresFeature) is registered in AuthModule, directly
    // after JwtAuthGuard -- it needs request.user, so it must not run before
    // authentication has populated it.
  ],
})
export class AppModule {}
