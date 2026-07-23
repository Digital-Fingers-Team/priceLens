import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { AFFILIATE_CONVERSION_QUEUE, AFFILIATE_PROVIDERS, CONVERSION_PROVIDERS } from './affiliate.constants';
import { AmazonAffiliateProvider } from './providers/amazon-affiliate.provider';
import { JumiaAffiliateProvider } from './providers/jumia-affiliate.provider';
import { NoonAffiliateProvider } from './providers/noon-affiliate.provider';
import { AffiliateProviderRegistry } from './providers/affiliate-provider.registry';
import { ImpactConversionProvider } from './providers/impact-conversion.provider';
import { ConversionProviderRegistry } from './providers/conversion-provider.registry';
import { AffiliateConfigService } from './affiliate-config.service';
import { AffiliateService } from './affiliate.service';
import { ConversionReconciliationService } from './conversion-reconciliation.service';
import { AffiliateConversionProcessor } from './affiliate-conversion.processor';
import { AffiliateConversionScheduler } from './affiliate-conversion.scheduler';
import { AffiliateController } from './affiliate.controller';
import { AffiliateConversionsController } from './affiliate-conversions.controller';

@Module({
  imports: [
    DatabaseModule,
    // Re-exports JwtModule -- needed for the redirect route's best-effort
    // JWT decode (see AffiliateController.extractOptionalUserId).
    AuthModule,
    BullModule.registerQueue({ name: AFFILIATE_CONVERSION_QUEUE }),
  ],
  controllers: [AffiliateController, AffiliateConversionsController],
  providers: [
    AmazonAffiliateProvider,
    JumiaAffiliateProvider,
    NoonAffiliateProvider,
    // To add a new store: write one AffiliateProvider class, list it here,
    // and add it to the factory below -- AffiliateProviderRegistry,
    // AffiliateService, and AffiliateController never need to change.
    {
      provide: AFFILIATE_PROVIDERS,
      useFactory: (
        amazon: AmazonAffiliateProvider,
        jumia: JumiaAffiliateProvider,
        noon: NoonAffiliateProvider,
      ) => [amazon, jumia, noon],
      inject: [AmazonAffiliateProvider, JumiaAffiliateProvider, NoonAffiliateProvider],
    },
    AffiliateProviderRegistry,
    AffiliateConfigService,
    AffiliateService,

    // ─── Conversion reconciliation ──────────────────────────────────────
    ImpactConversionProvider,
    // Same extensibility story as AFFILIATE_PROVIDERS: a new network is one
    // new ConversionProvider class, listed here and in this factory.
    {
      provide: CONVERSION_PROVIDERS,
      useFactory: (impact: ImpactConversionProvider) => [impact],
      inject: [ImpactConversionProvider],
    },
    ConversionProviderRegistry,
    ConversionReconciliationService,
    AffiliateConversionProcessor,
    AffiliateConversionScheduler,
  ],
})
export class AffiliateModule {}
