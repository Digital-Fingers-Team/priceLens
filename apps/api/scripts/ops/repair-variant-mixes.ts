/**
 * Finds products whose listings mix RAM/storage variants (audit 00 F-17) and
 * splits them, one new product per extra variant.
 *
 *   ts-node scripts/ops/repair-variant-mixes.ts                  # dry-run report (default)
 *   ts-node scripts/ops/repair-variant-mixes.ts --product <slug> # one product
 *   ts-node scripts/ops/repair-variant-mixes.ts --apply          # split, write a rollback file
 *   ts-node scripts/ops/repair-variant-mixes.ts --rollback <file>
 *
 * Run --apply only after the phase 02 matcher is deployed; the old one would
 * merge the variants back on the next ingestion. Rollback files go to the
 * repo-root backups/ directory (untracked).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import {
  applyVariantSplits,
  findVariantMixes,
  rollbackVariantSplits,
  type RollbackEntry,
} from '../../src/matching/repair/variant-repair';

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const rollbackFile = argValue('--rollback');
    if (rollbackFile) {
      const entries = JSON.parse(readFileSync(rollbackFile, 'utf8')) as RollbackEntry[];
      const result = await rollbackVariantSplits(prisma, entries);
      console.log(`Rolled back ${entries.length} split(s); ${result.restored} listing(s) restored.`);
      if (result.keptProducts.length) {
        console.log(`Kept (still referenced): ${result.keptProducts.join(', ')}`);
      }
      return;
    }

    const reports = await findVariantMixes(prisma, { productSlug: argValue('--product') });
    for (const report of reports) {
      const { plan } = report;
      console.log(`\n${report.slug}  (${report.title})`);
      console.log(`  varies by: ${plan.varying.join(', ')}`);
      console.log(`  keep  ${JSON.stringify(plan.keep.variant)}: ${plan.keep.listingIds.length} listing(s)`);
      for (const split of plan.splits) {
        console.log(`  split ${JSON.stringify(split.variant)}: ${split.listingIds.length} listing(s)`);
      }
      if (plan.unknown.length) console.log(`  unknown variant, left in place: ${plan.unknown.length} listing(s)`);
    }
    const moved = reports.reduce((sum, r) => sum + r.plan.splits.reduce((s, g) => s + g.listingIds.length, 0), 0);
    console.log(`\n${reports.length} mixed product(s); ${moved} listing(s) would move to new products.`);

    if (!process.argv.includes('--apply')) {
      console.log('Dry run: nothing changed. Re-run with --apply to split.');
      return;
    }

    const entries = await applyVariantSplits(prisma, reports);
    const dir = resolve(__dirname, '../../../../backups');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `repair-variant-mixes-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(file, JSON.stringify(entries, null, 2));
    console.log(`Applied: ${entries.length} new product(s). Rollback: --rollback ${file}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
