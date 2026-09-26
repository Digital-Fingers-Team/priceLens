/**
 * Recomputes normalized_title on canonical products and source listings with
 * the current normalizer (audit 03 B-21). Rows stored before phase 02 keep
 * the old normalization, so English searches miss some Arabic-titled
 * products until this runs.
 *
 *   ts-node scripts/ops/backfill-normalized-titles.ts          # dry-run report (default)
 *   ts-node scripts/ops/backfill-normalized-titles.ts --apply  # update, write a rollback file
 *   ts-node scripts/ops/backfill-normalized-titles.ts --rollback <file>
 *
 * Only rows whose value changes are written. Rollback files (the old values)
 * go to the repo-root backups/ directory (untracked).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { NormalizerService } from '../../src/matching/normalizer.service';

const BATCH = 500;

type Table = 'product' | 'listing';

interface Change {
  table: Table;
  id: string;
  before: string | null;
  after: string;
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function findChanges(prisma: PrismaClient, normalizer: NormalizerService): Promise<Change[]> {
  const changes: Change[] = [];

  for (let cursor: string | undefined; ; ) {
    const rows = await prisma.canonicalProduct.findMany({
      select: { id: true, title: true, normalizedTitle: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      const after = normalizer.normalizeTitle(row.title).normalized;
      if (after !== row.normalizedTitle) changes.push({ table: 'product', id: row.id, before: row.normalizedTitle, after });
    }
    cursor = rows[rows.length - 1].id;
  }

  for (let cursor: string | undefined; ; ) {
    const rows = await prisma.sourceListing.findMany({
      select: { id: true, rawTitle: true, normalizedTitle: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      const after = normalizer.normalizeTitle(row.rawTitle).normalized;
      if (after !== row.normalizedTitle) changes.push({ table: 'listing', id: row.id, before: row.normalizedTitle, after });
    }
    cursor = rows[rows.length - 1].id;
  }

  return changes;
}

async function write(prisma: PrismaClient, changes: Change[], value: (change: Change) => string | null): Promise<void> {
  for (let i = 0; i < changes.length; i += BATCH) {
    await prisma.$transaction(
      changes.slice(i, i + BATCH).map((change) =>
        change.table === 'product'
          ? prisma.canonicalProduct.update({ where: { id: change.id }, data: { normalizedTitle: value(change) ?? '' } })
          : prisma.sourceListing.update({ where: { id: change.id }, data: { normalizedTitle: value(change) } }),
      ),
    );
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const rollbackFile = argValue('--rollback');
    if (rollbackFile) {
      const changes = JSON.parse(readFileSync(rollbackFile, 'utf8')) as Change[];
      await write(prisma, changes, (change) => change.before);
      console.log(`Rolled back ${changes.length} normalized title(s).`);
      return;
    }

    const changes = await findChanges(prisma, new NormalizerService());
    const products = changes.filter((change) => change.table === 'product').length;
    console.log(`${products} product(s) and ${changes.length - products} listing(s) have a stale normalized title.`);
    for (const change of changes.slice(0, 10)) {
      console.log(`  ${change.table} ${change.id}\n    before: ${change.before}\n    after:  ${change.after}`);
    }

    if (!process.argv.includes('--apply')) {
      console.log('Dry run: nothing changed. Re-run with --apply to update.');
      return;
    }

    const dir = resolve(__dirname, '../../../../backups');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `backfill-normalized-titles-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(file, JSON.stringify(changes, null, 2));
    await write(prisma, changes, (change) => change.after);
    console.log(`Applied: ${changes.length} row(s) updated. Rollback: --rollback ${file}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
