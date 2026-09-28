/**
 * Writes the curated category tree (datasets/categoryTree.ts) to the
 * database. Idempotent: rows are matched by slug, so existing category ids,
 * and the products under them, never change. Never touches last_swept_at.
 *
 *   pnpm seed:categories             # write
 *   pnpm seed:categories --dry-run   # print what would be written
 */
import { PrismaClient } from '@prisma/client';
import { planCategoryUpserts } from './categoryTreePlan';
import { categoryTree } from './datasets/categoryTree';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const rows = planCategoryUpserts(categoryTree);

  if (dryRun) {
    for (const row of rows) {
      console.log(`${row.parentSlug ? '  ' : ''}${row.slug}  wave=${row.data.rolloutWave}  floor=${row.data.minPriceEgp ?? 'global'}`);
    }
    console.log(`${rows.length} categories (dry run, nothing written)`);
    return;
  }

  const prisma = new PrismaClient();
  try {
    const ids = new Map<string, string>();
    let created = 0;
    for (const row of rows) {
      const parentId = row.parentSlug ? ids.get(row.parentSlug) : null;
      if (row.parentSlug && !parentId) throw new Error(`parent ${row.parentSlug} missing for ${row.slug}`);
      const existing = await prisma.category.findUnique({ where: { slug: row.slug }, select: { id: true } });
      const saved = await prisma.category.upsert({
        where: { slug: row.slug },
        update: { ...row.data, parentId },
        create: { slug: row.slug, ...row.data, parentId },
        select: { id: true },
      });
      if (!existing) created += 1;
      ids.set(row.slug, saved.id);
    }
    console.log(`${rows.length} categories upserted (${created} new)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
