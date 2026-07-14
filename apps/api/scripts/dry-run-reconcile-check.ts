import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ReconciliationService } from '../src/matching/reconciliation.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const reconciliation = app.get(ReconciliationService);

  const report = await reconciliation.reconcile({ dryRun: true, maxPairs: 500 });

  console.log('\n=== Report ===');
  console.log(`pairsExamined: ${report.pairsExamined}`);
  console.log(`proposed merges: ${report.merges.length}`);
  for (const m of report.merges) {
    console.log(`- [sim ${m.similarity.toFixed(3)}] "${m.mergeTitle}" -> "${m.keepTitle}"`);
  }

  await app.close();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
