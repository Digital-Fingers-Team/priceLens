/**
 * One-off: apply the ingestion-time match guards to listings stored before
 * they existed.
 *
 * Rejects (matchStatus -> REJECTED) accepted listings that are
 *   1. junk offers (sponsored cards, bulk/MOQ wholesale),
 *   2. accessories or spare parts attached to a product that is not one, or
 *   3. price outliers against the product's remaining listings,
 * and retitles a product whose title came from a listing it just rejected, so
 * the page stops being named after the junk that created it. Slugs are kept:
 * changing them would break every existing link.
 *
 * MANUAL_ACCEPT listings are never touched -- a human approved them.
 *
 *   ts-node scripts/cleanup-bad-matches.ts            # report only
 *   ts-node scripts/cleanup-bad-matches.ts --apply    # write, plus a rollback file
 */
import { writeFileSync } from 'fs';
import { MatchStatus, PrismaClient } from '@prisma/client';
import { NormalizerService } from '../src/matching/normalizer.service';
import { FuzzyMatcherService } from '../src/matching/fuzzy-matcher.service';
import { filterPriceOutliers } from '../src/intelligence/price-statistics';

const JUNK = [/^\s*sponsored\b/i, /\bbulk\s+(?:order|buy|purchase|price)\b/i, /\bmoq\b/i];

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();
const normalizer = new NormalizerService();
const matcher = new FuzzyMatcherService();

interface Rejection {
  listingId: string;
  productId: string;
  reason: 'junk' | 'accessory' | 'product-type' | 'price-outlier';
  title: string;
  price: number;
}

async function main() {
  const products = await prisma.canonicalProduct.findMany({
    where: { sourceListings: { some: { matchStatus: MatchStatus.ACCEPTED } } },
    select: {
      id: true,
      title: true,
      sourceListings: {
        where: { matchStatus: { in: [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT] } },
        select: { id: true, rawTitle: true, priceUsd: true, matchStatus: true },
      },
    },
  });

  const rejections: Rejection[] = [];
  const retitles: Array<{ id: string; from: string; to: string }> = [];

  for (const product of products) {
    const productIsAccessory = normalizer.isAccessory(product.title);
    const rejected = new Set<string>();
    const reject = (listing: (typeof product.sourceListings)[number], reason: Rejection['reason']) => {
      if (listing.matchStatus === MatchStatus.MANUAL_ACCEPT || rejected.has(listing.id)) return;
      rejected.add(listing.id);
      rejections.push({
        listingId: listing.id,
        productId: product.id,
        reason,
        title: listing.rawTitle,
        price: Number(listing.priceUsd),
      });
    };

    // A different kind of product (a laptop on a graphics card) is only
    // rejected when most of the product's typed listings agree with the
    // product's own type -- otherwise the product title is the odd one out.
    const productType = matcher.productType(product.title);
    const typed = product.sourceListings.map((l) => matcher.productType(l.rawTitle)).filter(Boolean);
    const typeIsMajority = !!productType && typed.filter((t) => t === productType).length * 2 > typed.length;

    for (const listing of product.sourceListings) {
      if (JUNK.some((pattern) => pattern.test(listing.rawTitle))) reject(listing, 'junk');
      else if (!productIsAccessory && normalizer.isAccessory(listing.rawTitle)) reject(listing, 'accessory');
      else if (typeIsMajority && matcher.detectProductTypeConflict(listing.rawTitle, product.title)) reject(listing, 'product-type');
    }

    const priced = product.sourceListings.filter(
      (listing) => !rejected.has(listing.id) && listing.priceUsd != null && Number(listing.priceUsd) > 0,
    );
    const { kept, excluded, median } = filterPriceOutliers(priced, (listing) => Number(listing.priceUsd));
    for (const listing of excluded) reject(listing, 'price-outlier');

    // Named after a listing we just rejected: take the title of the kept
    // listing priced closest to the median, i.e. the most typical offer.
    // The listing's own title can drift after the product was created from it,
    // so a product whose title is itself junk is renamed as well.
    const namedAfterRejected =
      JUNK.some((pattern) => pattern.test(product.title)) ||
      product.sourceListings.some((listing) => rejected.has(listing.id) && listing.rawTitle === product.title);
    if (namedAfterRejected && kept.length > 0 && median != null) {
      const typical = [...kept].sort(
        (a, b) => Math.abs(Number(a.priceUsd) - median) - Math.abs(Number(b.priceUsd) - median),
      )[0];
      if (!rejected.has(typical.id)) retitles.push({ id: product.id, from: product.title, to: typical.rawTitle });
    }
  }

  const byReason = rejections.reduce<Record<string, number>>((acc, r) => {
    acc[r.reason] = (acc[r.reason] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`products scanned: ${products.length}`);
  console.log(`listings to reject: ${rejections.length}`, byReason);
  console.log(`products touched: ${new Set(rejections.map((r) => r.productId)).size}`);
  console.log(`products to retitle: ${retitles.length}`);
  for (const reason of ['junk', 'accessory', 'product-type', 'price-outlier'] as const) {
    console.log(`\n-- sample: ${reason}`);
    for (const r of rejections.filter((x) => x.reason === reason).slice(0, 8)) {
      console.log(`  ${r.price.toFixed(0).padStart(9)}  ${r.title.slice(0, 90)}`);
    }
  }
  console.log('\n-- sample retitles');
  for (const t of retitles.slice(0, 8)) console.log(`  ${t.from.slice(0, 60)}\n    -> ${t.to.slice(0, 60)}`);

  if (!apply) {
    console.log('\nreport only; re-run with --apply to write');
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rollbackPath = `${process.env.ROLLBACK_DIR ?? '/tmp'}/cleanup-bad-matches-${stamp}.json`;
  const retitled = await prisma.canonicalProduct.findMany({
    where: { id: { in: retitles.map((t) => t.id) } },
    select: { id: true, title: true, normalizedTitle: true },
  });
  writeFileSync(rollbackPath, JSON.stringify({ rejectedListingIds: rejections.map((r) => r.listingId), retitled }, null, 2));

  await prisma.$transaction([
    prisma.sourceListing.updateMany({
      where: { id: { in: rejections.map((r) => r.listingId) }, matchStatus: MatchStatus.ACCEPTED },
      data: { matchStatus: MatchStatus.REJECTED },
    }),
    ...retitles.map((t) =>
      prisma.canonicalProduct.update({
        where: { id: t.id },
        data: { title: t.to, normalizedTitle: normalizer.normalizeTitle(t.to).normalized },
      }),
    ),
  ]);
  console.log(`\napplied. rollback data: ${rollbackPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
