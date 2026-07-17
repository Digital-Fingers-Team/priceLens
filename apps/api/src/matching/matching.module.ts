import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FuzzyMatcherService } from './fuzzy-matcher.service';
import { FxRatesService } from './fx-rates.service';
import { NormalizerService } from './normalizer.service';
import { PriceSanityService } from './price-sanity.service';
import { ReconciliationService } from './reconciliation.service';
import { SemanticService } from './semantic.service';

@Module({
  imports: [DatabaseModule],
  providers: [NormalizerService, FuzzyMatcherService, SemanticService, PriceSanityService, ReconciliationService, FxRatesService],
  exports: [NormalizerService, FuzzyMatcherService, SemanticService, PriceSanityService, ReconciliationService, FxRatesService],
})
export class MatchingModule {}
