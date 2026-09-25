import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FuzzyMatcherService } from './fuzzy-matcher.service';
import { FxRatesService } from './fx-rates.service';
import { NormalizerService } from './normalizer.service';
import { ReconciliationService } from './reconciliation.service';
import { SemanticService } from './semantic.service';

@Module({
  imports: [DatabaseModule],
  providers: [NormalizerService, FuzzyMatcherService, SemanticService, ReconciliationService, FxRatesService],
  exports: [NormalizerService, FuzzyMatcherService, SemanticService, ReconciliationService, FxRatesService],
})
export class MatchingModule {}
