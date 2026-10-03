import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CatalogCleanupService } from './catalog-cleanup.service';
import { FuzzyMatcherService } from './fuzzy-matcher.service';
import { FxRatesService } from './fx-rates.service';
import { NormalizerService } from './normalizer.service';
import { ReconciliationService } from './reconciliation.service';
import { SemanticService } from './semantic.service';
import { TitleTranslationService } from './title-translation.service';

const SERVICES = [
  NormalizerService,
  FuzzyMatcherService,
  SemanticService,
  ReconciliationService,
  CatalogCleanupService,
  FxRatesService,
  TitleTranslationService,
];

@Module({
  imports: [DatabaseModule],
  providers: SERVICES,
  exports: SERVICES,
})
export class MatchingModule {}
