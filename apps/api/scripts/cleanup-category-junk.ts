/**
 * One-off: apply ingestion's category rules to listings stored before them.
 *
 *   1. In device categories (phones, laptops, GPUs...), an accessory or spare
 *      part is never the product -- reject it even when it is a product of its
 *      own ("Case for Oppo A33" filed as a smartphone). Only when it is also
 *      cheap for the category (a phone "with Free cover" says "cover" too).
 *      "Cheap" is measured against the category median without accessory-
 *      worded listings, since those drag it down.
 *   2. Then, per category, reject what is priced under 2.5% of the median of
 *      what is left (a replacement screen listed as "OPPO A35 HD" at 298 EGP).
 *      The median is taken after step 1 so it matches what ingestion sees.
 *
 * MANUAL_ACCEPT listings are never touched. Products left with no accepted
 * listing drop out of search on their own.
 *
 *   ts-node scripts/cleanup-category-junk.ts            # report only
 *   ts-node scripts/cleanup-category-junk.ts --apply    # write, plus a rollback file
 */
import { writeFileSync } from 'fs';
import { MatchStatus, PrismaClient } from '@prisma/client';
import { NormalizerService } from '../src/matching/normalizer.service';

// Keep in step with live-ingestion.service.ts.
const CATEGORY_PRICE_FLOOR_RATIO = 0.025;
const MIN_LISTINGS_FOR_CATEGORY_FLOOR = 50;
const DEVICE_ACCESSORY_PRICE_RATIO = 0.15;
const DESCRIBES_DEVICE = /\b(dual[\s-]?sim|keypad|feature\s+phone|\d+\s?gb\s+ram)\b/i;
const DEVICE_CATEGORIES = new Set(['smartphones', 'tablets', 'laptops', 'tvs', 'monitors', 'cpus', 'graphics cards']);

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();
const normalizer = new NormalizerService();

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function main() {
  const listings = await prisma.sourceListing.findMany({
    where: { matchStatus: MatchStatus.ACCEPTED, canonicalProductId: { not: null } },
    select: {
      id: true,
      rawTitle: true,
      priceUsd: true,
      canonicalProductId: true,
      canonicalProduct: { select: { category: { select: { name: true } } } },
    },
  });

  const rejected = new Map<string, { reason: string; category: string; title: string; price: number }>();
  const categoryOf = (l: (typeof listings)[number]) => l.canonicalProduct?.category.name ?? '?';

  const nonAccessoryPrices = new Map<string, number[]>();
  for (const listing of listings) {
    if (normalizer.isAccessory(listing.rawTitle)) continue;
    const prices = nonAccessoryPrices.get(categoryOf(listing)) ?? [];
    prices.push(Number(listing.priceUsd));
    nonAccessoryPrices.set(categoryOf(listing), prices);
  }

  const byCategory = new Map<string, typeof listings>();
  for (const listing of listings) {
    const category = categoryOf(listing);
    const price = Number(listing.priceUsd);
    const deviceMedian = median((nonAccessoryPrices.get(category) ?? []).filter((p) => p > 0));
    if (
      DEVICE_CATEGORIES.has(category.trim().toLowerCase()) &&
      deviceMedian != null &&
      price < deviceMedian * DEVICE_ACCESSORY_PRICE_RATIO &&
      normalizer.isAccessory(listing.rawTitle) &&
      !DESCRIBES_DEVICE.test(listing.rawTitle)
    ) {
      rejected.set(listing.id, { reason: 'device-accessory', category, title: listing.rawTitle, price });
      continue;
    }
    const bucket = byCategory.get(category) ?? [];
    bucket.push(listing);
    byCategory.set(category, bucket);
  }

  const floors: Record<string, number> = {};
  for (const [category, bucket] of byCategory) {
    const prices = bucket.map((l) => Number(l.priceUsd)).filter((p) => Number.isFinite(p) && p > 0);
    const mid = prices.length >= MIN_LISTINGS_FOR_CATEGORY_FLOOR ? median(prices) : null;
    if (mid == null) continue;
    const floor = mid * CATEGORY_PRICE_FLOOR_RATIO;
    floors[category] = Math.round(floor);
    for (const listing of bucket) {
      const price = Number(listing.priceUsd);
      if (Number.isFinite(price) && price > 0 && price < floor) {
        rejected.set(listing.id, { reason: 'category-floor', category, title: listing.rawTitle, price });
      }
    }
  }

  const rows = [...rejected.values()];
  const count = (reason: string) => rows.filter((r) => r.reason === reason).length;
  console.log(`accepted listings scanned: ${listings.length}`);
  console.log(`to reject: ${rows.length} (device-accessory ${count('device-accessory')}, category-floor ${count('category-floor')})`);
  console.log(`floors (EGP): ${JSON.stringify(floors)}`);
  const perCategory = rows.reduce<Record<string, number>>((acc, r) => ((acc[r.category] = (acc[r.category] ?? 0) + 1), acc), {});
  console.log(`per category: ${JSON.stringify(perCategory)}`);
  for (const reason of ['device-accessory', 'category-floor']) {
    console.log(`\n-- sample: ${reason}`);
    for (const r of rows.filter((x) => x.reason === reason).sort(() => Math.random() - 0.5).slice(0, 12)) {
      console.log(`  ${r.category.padEnd(15)} ${r.price.toFixed(0).padStart(7)}  ${r.title.slice(0, 80)}`);
    }
  }

  if (!apply) {
    console.log('\nreport only; re-run with --apply to write');
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rollbackPath = `${process.env.ROLLBACK_DIR ?? '/tmp'}/cleanup-category-junk-${stamp}.json`;
  writeFileSync(rollbackPath, JSON.stringify({ rejectedListingIds: [...rejected.keys()] }, null, 2));
  const { count: updated } = await prisma.sourceListing.updateMany({
    where: { id: { in: [...rejected.keys()] }, matchStatus: MatchStatus.ACCEPTED },
    data: { matchStatus: MatchStatus.REJECTED },
  });
  console.log(`\napplied to ${updated} listings. rollback data: ${rollbackPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
