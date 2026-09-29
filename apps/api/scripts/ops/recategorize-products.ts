/**
 * Moves the products of a broad category into the specific leaves their
 * titles resolve to (category expansion, 2026-09-28). Run it before the new
 * leaves are swept: matching only compares products within one category, so
 * a refrigerator left in "home-appliances" would be created again in
 * "refrigerators".
 *
 *   ts-node scripts/ops/recategorize-products.ts --from home-appliances           # dry run (default)
 *   ts-node scripts/ops/recategorize-products.ts --from home-appliances --apply   # move, write a rollback file
 *   ts-node scripts/ops/recategorize-products.ts --recheck <rollback file> [--apply]   # re-place what a run moved
 *   ts-node scripts/ops/recategorize-products.ts --rollback <file>
 *
 * Targets are the leaves of rollout wave 1 and up. Rollback files go to
 * BACKUP_DIR or the repo-root backups/ directory (see backup-dir.ts); in the
 * container run with BACKUP_DIR=/tmp/backups and copy the file out.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { planRecategorization, type RecategorizeMove } from '../../src/scraping/ingestion/recategorize';
import { pickCategoryForQuery } from '../../src/scraping/ingestion/search-queries';
import { backupDir } from './backup-dir';

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function moveAll(prisma: PrismaClient, moves: Array<{ productId: string; toCategoryId: string }>) {
  const byTarget = new Map<string, string[]>();
  for (const move of moves) byTarget.set(move.toCategoryId, [...(byTarget.get(move.toCategoryId) ?? []), move.productId]);
  await prisma.$transaction(
    [...byTarget.entries()].map(([categoryId, ids]) =>
      prisma.canonicalProduct.updateMany({ where: { id: { in: ids } }, data: { categoryId } }),
    ),
  );
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const rollbackFile = argValue('--rollback');
    if (rollbackFile) {
      const moves = JSON.parse(readFileSync(rollbackFile, 'utf8')) as RecategorizeMove[];
      await moveAll(prisma, moves.map((move) => ({ productId: move.productId, toCategoryId: move.fromCategoryId })));
      console.log(`Rolled back ${moves.length} product(s).`);
      return;
    }

    // --from <slug>: every product in that category.
    // --recheck <rollback file>: the products an earlier run moved, wherever
    // they are now (to correct placements after the tree's terms change).
    const fromSlug = argValue('--from');
    const recheckFile = argValue('--recheck');
    if (!fromSlug && !recheckFile) throw new Error('--from <category slug> or --recheck <rollback file> is required');
    const targets = await prisma.category.findMany({ where: { level: { gt: 0 }, rolloutWave: { gte: 1 } } });
    const where = fromSlug
      ? { categoryId: (await prisma.category.findUniqueOrThrow({ where: { slug: fromSlug } })).id }
      : { id: { in: (JSON.parse(readFileSync(recheckFile!, 'utf8')) as RecategorizeMove[]).map((move) => move.productId) } };
    const label = fromSlug ?? 'recheck';
    const products = await prisma.canonicalProduct.findMany({ where, select: { id: true, title: true, categoryId: true } });
    const moves = planRecategorization(products, targets);

    // A rechecked product that no target claims any more goes back to the
    // category the earlier run took it from.
    if (recheckFile) {
      const origin = new Map((JSON.parse(readFileSync(recheckFile, 'utf8')) as RecategorizeMove[]).map((move) => [move.productId, move.fromCategoryId]));
      const originSlugs = new Map((await prisma.category.findMany({ where: { id: { in: [...new Set(origin.values())] } } })).map((c) => [c.id, c.slug]));
      const planned = new Set(moves.map((move) => move.productId));
      for (const product of products) {
        const back = origin.get(product.id);
        if (planned.has(product.id) || !back || back === product.categoryId) continue;
        if (pickCategoryForQuery(product.title, targets, {})) continue; // still where it resolves to
        moves.push({ productId: product.id, title: product.title, fromCategoryId: product.categoryId, toCategoryId: back, toSlug: originSlugs.get(back) ?? back });
      }
    }

    const counts = new Map<string, number>();
    for (const move of moves) counts.set(move.toSlug, (counts.get(move.toSlug) ?? 0) + 1);
    for (const [slug, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) console.log(`${String(count).padStart(5)}  ${slug}`);
    console.log(`${moves.length} of ${products.length} product(s) (${label}) would move; ${products.length - moves.length} stay.`);
    for (const move of moves.slice(0, 80)) console.log(`  ${move.toSlug.padEnd(24)} ${move.title.slice(0, 90)}`);

    if (!process.argv.includes('--apply')) {
      console.log('Dry run: nothing changed. Re-run with --apply.');
      return;
    }
    const file = join(backupDir(), `recategorize-${label}-${new Date().toISOString().replace(/[:.]/g, '')}.json`);
    writeFileSync(file, JSON.stringify(moves, null, 2));
    await moveAll(prisma, moves);
    console.log(`Moved ${moves.length} product(s). Rollback file: ${file}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
