/**
 * Moves earbuds and earphones filed under other leaves (phone accessories,
 * smartphones, smart watches, processors, ...) to Headphones. Seen 2026-10-10:
 * 390 in Phone Accessories alone, created by store searches for products filed
 * there (fixed in ListingProcessor.homeCategory). Cases, ear tips, batteries
 * and other parts *for* earbuds stay where they are.
 *
 *   ts-node scripts/ops/move-misfiled-earbuds.ts            # dry run (default)
 *   ts-node scripts/ops/move-misfiled-earbuds.ts --apply    # move, write a rollback file
 *   ts-node scripts/ops/recategorize-products.ts --rollback <file>   # undo
 *
 * In the container run with BACKUP_DIR=/tmp/backups and copy the file out.
 * A moved product may duplicate one already in Headphones; the hourly
 * reconciliation compares them there (same category) and merges on the judge's yes.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import type { RecategorizeMove } from '../../src/scraping/ingestion/recategorize';
import { backupDir } from './backup-dir';
import { isMisfiledEarbuds } from './earbuds-title';

const FROM = [
  'phone-accessories',
  'smartphones',
  'smart-watches',
  'processors',
  'tablets',
  'gaming-consoles',
  'speakers',
  'microphones',
  'car-audio',
];

async function main() {
  const prisma = new PrismaClient();
  try {
    const headphones = await prisma.category.findUniqueOrThrow({ where: { slug: 'headphones' } });
    const from = await prisma.category.findMany({ where: { slug: { in: FROM } }, select: { id: true, slug: true } });
    const products = await prisma.canonicalProduct.findMany({
      where: { categoryId: { in: from.map((c) => c.id) } },
      select: { id: true, title: true, categoryId: true },
    });
    const slugOf = new Map(from.map((c) => [c.id, c.slug]));
    const moves: RecategorizeMove[] = products
      .filter((product) => isMisfiledEarbuds(product.title))
      .map((product) => ({
        productId: product.id,
        title: product.title,
        fromCategoryId: product.categoryId,
        toCategoryId: headphones.id,
        toSlug: 'headphones',
      }));

    const counts = new Map<string, number>();
    for (const move of moves) counts.set(slugOf.get(move.fromCategoryId) ?? '?', (counts.get(slugOf.get(move.fromCategoryId) ?? '?') ?? 0) + 1);
    for (const [slug, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) console.log(`${String(count).padStart(5)}  from ${slug}`);
    console.log(`${moves.length} of ${products.length} product(s) would move to headphones.`);
    for (const move of moves.slice(0, 60)) console.log(`  ${(slugOf.get(move.fromCategoryId) ?? '').padEnd(18)} ${move.title.slice(0, 90)}`);

    if (!process.argv.includes('--apply')) {
      console.log('Dry run: nothing changed. Re-run with --apply.');
      return;
    }
    const file = join(backupDir(), `move-earbuds-${new Date().toISOString().replace(/[:.]/g, '')}.json`);
    writeFileSync(file, JSON.stringify(moves, null, 2));
    for (let i = 0; i < moves.length; i += 500) {
      await prisma.canonicalProduct.updateMany({
        where: { id: { in: moves.slice(i, i + 500).map((move) => move.productId) } },
        data: { categoryId: headphones.id },
      });
    }
    console.log(`Moved ${moves.length} product(s). Rollback: recategorize-products.ts --rollback ${file}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
