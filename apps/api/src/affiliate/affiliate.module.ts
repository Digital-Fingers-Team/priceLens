import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { AFFILIATE_PROVIDERS } from './affiliate.constants';
import { AmazonAffiliateProvider } from './providers/amazon-affiliate.provider';
import { JumiaAffiliateProvider } from './providers/jumia-affiliate.provider';
import { NoonAffiliateProvider } from './providers/noon-affiliate.provider';
import { AffiliateProviderRegistry } from './providers/affiliate-provider.registry';
import { AffiliateConfigService } from './affiliate-config.service';
import { AffiliateService } from './affiliate.service';
import { AffiliateController } from './affiliate.controller';

@Module({
  // AuthModule re-exports JwtModule -- needed for the redirect route's
  // best-effort JWT decode (see AffiliateController.extractOptionalUserId).
  imports: [DatabaseModule, AuthModule],
  controllers: [AffiliateController],
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
  ],
})
export class AffiliateModule {}
