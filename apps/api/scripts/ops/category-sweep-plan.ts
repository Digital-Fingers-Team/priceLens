/**
 * Dry run of the next scheduled category sweep: which leaves it covers and
 * the queries each store will be sent. Reads the database, scrapes nothing,
 * writes nothing.
 *
 * Usage (from apps/api):
 *   pnpm exec dotenv -e ../../.env -- ts-node scripts/ops/category-sweep-plan.ts
 *   CATEGORY_SWEEP_MAX_WAVE=2 pnpm exec dotenv -e ../../.env -- ts-node scripts/ops/category-sweep-plan.ts
 */
import { PrismaClient } from '@prisma/client';
import { buildQueriesForCategory } from '../../src/scraping/ingestion/search-queries';
import { selectSweepCategories } from '../../src/scraping/ingestion/sweep-selection';

async function main() {
  const maxWave = parseInt(process.env.CATEGORY_SWEEP_MAX_WAVE ?? '0', 10);
  const maxNewPerRun = parseInt(process.env.MAX_CATEGORY_SWEEPS_PER_RUN ?? '15', 10);
  const prisma = new PrismaClient();
  try {
    const leaves = await prisma.category.findMany({ where: { level: { gt: 0 } }, orderBy: { name: 'asc' } });
    const selected = selectSweepCategories(leaves, { maxWave, maxNewPerRun });
    console.log(`CATEGORY_SWEEP_MAX_WAVE=${maxWave} MAX_CATEGORY_SWEEPS_PER_RUN=${maxNewPerRun}`);
    for (const category of selected) {
      const swept = category.lastSweptAt ? category.lastSweptAt.toISOString() : 'never';
      console.log(`wave ${category.rolloutWave}  ${category.slug.padEnd(28)} last ${swept}  ->  ${buildQueriesForCategory(category).join(' | ')}`);
    }
    const queries = selected.reduce((sum, category) => sum + buildQueriesForCategory(category).length, 0);
    console.log(`${selected.length} categories, ${queries} queries per store`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
