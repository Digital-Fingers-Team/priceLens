// Standalone reconciliation runner. Deliberately does NOT bootstrap the full
// AppModule: that pulls in BullModule/WorkersModule, and booting a second app
// context on the same Redis queue caused this script to pick up and execute
// an unrelated queued live-ingestion job (real scraping across all 8
// platforms) as a side effect, which then ran for ~10+ minutes doing nothing
// useful (Ollama embed calls timing out, OpenRouter fallback dead — see
// OPENROUTER_API_KEY 401 in session notes) while looking like a hang.
// This module only wires up what ReconciliationService actually needs.
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../src/database/prisma.service';
import { NormalizerService } from '../src/matching/normalizer.service';
import { FuzzyMatcherService } from '../src/matching/fuzzy-matcher.service';
import { SemanticService } from '../src/matching/semantic.service';
import { ReconciliationService } from '../src/matching/reconciliation.service';
import appConfig from '../src/config/app.config';
import searchConfig from '../src/config/search.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, searchConfig],
      envFilePath: ['../../.env.local', '../../.env'],
      cache: true,
    }),
  ],
  providers: [PrismaService, NormalizerService, FuzzyMatcherService, SemanticService, ReconciliationService],
})
class ReconcileOnlyModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(ReconcileOnlyModule, { logger: ['log', 'warn', 'error'] });
  const reconciliation = app.get(ReconciliationService);

  const report = await reconciliation.reconcile({ dryRun: false, maxPairs: 500 });

  console.log('\n=== Report ===');
  console.log(`pairsExamined: ${report.pairsExamined}`);
  console.log(`executed merges: ${report.merges.length}`);
  for (const m of report.merges) {
    console.log(`- [sim ${m.similarity.toFixed(3)}] "${m.mergeTitle}" -> "${m.keepTitle}"`);
  }

  await app.close();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
