/**
 * Offer audit: asks the AI judge whether each store offer on a product is
 * really that product, and splits off the ones it rejects (owner decision
 * 2026-09-29; see src/matching/repair/offer-audit.ts).
 *
 *   ts-node scripts/ops/audit-product-offers.ts [--limit 100]        # dry run: ask, report, change nothing
 *   ts-node scripts/ops/audit-product-offers.ts --product <slug>     # one product
 *   ts-node scripts/ops/audit-product-offers.ts --limit 500 --apply  # split, write a rollback file
 *   ts-node scripts/ops/audit-product-offers.ts --rollback <file>
 *   --parallel 4: products asked about at the same time (default 4)
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
    // Each product's offers go to the judge in one request (up to 8 titles),
    // and several products are asked at once, spread over the judge's slots.
    const queue = products.filter((product) => product._count.sourceListings >= 2);
    const concurrency = Math.max(1, parseInt(argValue('--parallel') ?? '4', 10));
    const worker = async () => {
      for (let product = queue.shift(); product && !stoppedEarly; product = queue.shift()) {
        const listings = await prisma.sourceListing.findMany({
          where: { canonicalProductId: product.id, matchStatus: { in: ACCEPTED } },
          select: { id: true, rawTitle: true },
          orderBy: { id: 'asc' },
        });
        const toAsk = planOfferAudit(product, listings, new Map()).toAsk;
        const answers = await semantic.judgeMany(product.title, toAsk.map((listing) => listing.rawTitle));
        asked += toAsk.length;
        const verdicts = new Map(toAsk.map((listing, index) => [listing.id, answers[index]]));
        if (answers.includes(null) && !semantic.isAvailable()) stoppedEarly = true;

        const plan = planOfferAudit(product, listings, verdicts);
        if (plan.splits.length > 0) {
          reports.push({ productId: product.id, slug: product.slug, title: product.title, plan });
          const lines = plan.splits.map(
            (split) => `  split off: ${listings.find((listing) => listing.id === split.listingIds[0])?.rawTitle}`,
          );
          console.log(`\n${product.title}  (${product.slug})\n${lines.join('\n')}`);
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));

    const offers = reports.reduce((sum, report) => sum + report.plan.splits.length, 0);
    console.log(
      `\nChecked ${products.length} product(s), asked the judge about ${asked} offer(s): ` +
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
