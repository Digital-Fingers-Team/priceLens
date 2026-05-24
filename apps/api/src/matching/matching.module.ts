import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FuzzyMatcherService } from './fuzzy-matcher.service';
import { NormalizerService } from './normalizer.service';
import { PriceSanityService } from './price-sanity.service';
import { SemanticService } from './semantic.service';

@Module({
  imports: [DatabaseModule],
  providers: [NormalizerService, FuzzyMatcherService, SemanticService, PriceSanityService],
  exports: [NormalizerService, FuzzyMatcherService, SemanticService, PriceSanityService],
})
export class MatchingModule {}
