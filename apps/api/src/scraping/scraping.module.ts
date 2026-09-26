import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MatchingModule } from '../matching/matching.module';
import { BrowserSessionService } from './browser/browser-session.service';
import {
  CONNECTOR_CLASSES,
  ConnectorRegistry,
  retailerConnectorsProvider,
} from './connectors/connector.registry';
import { IngestionRepository } from './ingestion/ingestion.repository';
import { ListingProcessor } from './ingestion/listing-processor.service';
import { StoreCallGuard } from './ingestion/store-call-guard';
import { LiveIngestionService } from './live-ingestion.service';
import { StoreCoverageService } from './store-coverage.service';

/**
 * Store adapters and the ingestion flow built on them.
 *
 *   connectors/          one RetailerConnector per store, ConnectorRegistry
 *   ingestion/           ListingProcessor (pipeline + persistence), repository
 *   live-ingestion       scheduled sweep, on-demand query run, backfill
 *   store-coverage       per-product expansion, coverage sweep
 */
@Module({
  imports: [DatabaseModule, MatchingModule],
  providers: [
    BrowserSessionService,
    ...CONNECTOR_CLASSES,
    retailerConnectorsProvider,
    ConnectorRegistry,
    IngestionRepository,
    ListingProcessor,
    StoreCallGuard,
    LiveIngestionService,
    StoreCoverageService,
  ],
  exports: [LiveIngestionService, StoreCoverageService],
})
export class ScrapingModule {}
