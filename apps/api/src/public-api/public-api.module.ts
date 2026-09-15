import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { SellerModule } from '../seller/seller.module';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { MarketDataService } from './market-data.service';
import { PublicApiController } from './public-api.controller';

@Module({
  imports: [DatabaseModule, IntelligenceModule, SellerModule],
  controllers: [PublicApiController, ApiKeysController],
  providers: [ApiKeysService, MarketDataService, ApiKeyGuard],
  exports: [ApiKeysService],
})
export class PublicApiModule {}
