import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MatchingModule } from '../matching/matching.module';
import { CbeFxProvider, FX_RATE_PROVIDERS, MarketFxProvider } from './fx-rate.providers';
import { FxTrackingService } from './fx-tracking.service';
import { ImportFinderService } from './import-finder.service';
import { TradeController } from './trade.controller';
import { TrendRadarService } from './trend-radar.service';

@Module({
  imports: [DatabaseModule, MatchingModule],
  controllers: [TradeController],
  providers: [
    CbeFxProvider,
    MarketFxProvider,
    { provide: FX_RATE_PROVIDERS, useFactory: (cbe: CbeFxProvider, market: MarketFxProvider) => [cbe, market], inject: [CbeFxProvider, MarketFxProvider] },
    ImportFinderService,
    FxTrackingService,
    TrendRadarService,
  ],
  exports: [ImportFinderService, FxTrackingService, TrendRadarService],
})
export class TradeModule {}
