/**
 * Repairs what category-scoped matching left behind (CatalogCleanupService):
 * phone accessories filed under the sweep that found them, empty products,
 * identical titles split across categories, price history left on the old copy.
 *
 *   ts-node --transpile-only scripts/ops/clean-duplicate-products.ts            # dry run (default): counts only
 *   ts-node --transpile-only scripts/ops/clean-duplicate-products.ts --apply    # change, write the category moves to a file
 *
 * Merges are logged in product_merges (decided_by 'cleanup') and old URLs
 * redirect to the kept product. Take a pg_dump first: deleted empty products
 * and the history re-pointing have no rollback file. In the container:
 *   podman exec -e PROCESS_ROLE=api -e BACKUP_DIR=/tmp/backups -w /repo/apps/api pricelens-worker \
 *     npx ts-node --transpile-only scripts/ops/clean-duplicate-products.ts --apply
 * PROCESS_ROLE=api keeps this process from consuming queue jobs.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { CatalogCleanupService } from '../../src/matching/catalog-cleanup.service';
import { backupDir } from './backup-dir';

async function main() {
  const apply = process.argv.includes('--apply');
  const file = apply ? join(backupDir(), `clean-duplicates-moves-${new Date().toISOString().replace(/[:.]/g, '')}.json`) : null;
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  try {
    const report = await app.get(CatalogCleanupService).run({ apply });
    if (file) writeFileSync(file, JSON.stringify(report.recategorized, null, 2));
    const { recategorized, ...counts } = report;
    console.log(JSON.stringify({ ...counts, recategorized: recategorized.length, movesFile: file }, null, 2));
    if (!apply) console.log('Dry run: nothing changed. Re-run with --apply.');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
