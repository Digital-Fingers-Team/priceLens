/**
 * Offer audit: asks the AI judge whether each store offer on a product is
 * really that product, and splits off the ones it rejects (owner decision
 * 2026-09-29; see src/matching/repair/offer-audit.ts).
 *
 *   ts-node scripts/ops/audit-product-offers.ts [--limit 100]        # dry run: ask, report, change nothing
 *   ts-node scripts/ops/audit-product-offers.ts --product <slug>     # one product
 *   ts-node scripts/ops/audit-product-offers.ts --limit 500 --apply  # split, write a rollback file
 *   ts-node scripts/ops/audit-product-offers.ts --rollback <file>
 *
 * Products with the most offers go first. Every verdict is stored
 * (match_judgements), so a dry run's questions are not paid for twice. The
 * run stops early when every judge slot is paused. Rollback files go to
 * BACKUP_DIR or the repo-root backups/ directory (see backup-dir.ts).
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { MatchStatus, PrismaClient } from '@prisma/client';
import searchConfig from '../../src/config/search.config';
import { SemanticService } from '../../src/matching/semantic.service';
import { planOfferAudit } from '../../src/matching/repair/offer-audit';
import {
  applyVariantSplits,
  rollbackVariantSplits,
  type ProductRepairReport,
  type RollbackEntry,
} from '../../src/matching/repair/variant-repair';
import { backupDir } from './backup-dir';

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const ACCEPTED = [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT];

async function main() {
  const prisma = new PrismaClient();
  try {
    const rollbackFile = argValue('--rollback');
    if (rollbackFile) {
      const entries = JSON.parse(readFileSync(rollbackFile, 'utf8')) as RollbackEntry[];
      const result = await rollbackVariantSplits(prisma, entries);
      console.log(`Rolled back ${entries.length} split(s); ${result.restored} listing(s) restored.`);
      if (result.keptProducts.length) console.log(`Kept (still referenced): ${result.keptProducts.join(', ')}`);
      return;
    }

    const semantic = new SemanticService(new ConfigService({ search: searchConfig() }), prisma as never);
    const limit = Math.max(1, parseInt(argValue('--limit') ?? '100', 10));
    const slug = argValue('--product');

    const products = await prisma.canonicalProduct.findMany({
      where: { ...(slug ? { slug } : {}), sourceListings: { some: { matchStatus: { in: ACCEPTED } } } },
      select: {
        id: true,
        slug: true,
        title: true,
        _count: { select: { sourceListings: { where: { matchStatus: { in: ACCEPTED } } } } },
      },
      orderBy: [{ sourceListings: { _count: 'desc' } }, { id: 'asc' }],
      take: slug ? 1 : limit,
    });

    const reports: ProductRepairReport[] = [];
    let asked = 0;
    let stoppedEarly = false;
    for (const product of products) {
      if (product._count.sourceListings < 2) continue;
      const listings = await prisma.sourceListing.findMany({
        where: { canonicalProductId: product.id, matchStatus: { in: ACCEPTED } },
        select: { id: true, rawTitle: true },
        orderBy: { id: 'asc' },
      });
      const verdicts = new Map<string, boolean | null>();
      for (const listing of planOfferAudit(product, listings, verdicts).toAsk) {
        const verdict = await semantic.judgeSameProduct(listing.rawTitle, product.title);
        asked += 1;
        verdicts.set(listing.id, verdict);
        if (verdict === null && !semantic.isAvailable()) {
          stoppedEarly = true;
          break;
        }
      }
      const plan = planOfferAudit(product, listings, verdicts);
      if (plan.splits.length > 0) {
        reports.push({ productId: product.id, slug: product.slug, title: product.title, plan });
        console.log(`\n${product.title}  (${product.slug})`);
        for (const split of plan.splits) {
          const moved = listings.find((listing) => listing.id === split.listingIds[0]);
          console.log(`  split off: ${moved?.rawTitle}`);
        }
      }
      if (stoppedEarly) break;
    }

    const offers = reports.reduce((sum, report) => sum + report.plan.splits.length, 0);
    console.log(
      `\nChecked ${products.length} product(s), asked the judge ${asked} time(s): ` +
        `${offers} offer(s) on ${reports.length} product(s) do not belong.` +
        (stoppedEarly ? ' Stopped early: every judge slot is paused; run again later.' : ''),
    );

    if (!process.argv.includes('--apply')) {
      console.log('Dry run: nothing changed. Re-run with --apply.');
      return;
    }
    const dir = backupDir();
    const rollback = await applyVariantSplits(prisma, reports);
    const file = join(dir, `offer-audit-${new Date().toISOString().replace(/[:.]/g, '')}.json`);
    writeFileSync(file, JSON.stringify(rollback, null, 2));
    console.log(`Split off ${rollback.length} offer(s). Rollback file: ${file}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
