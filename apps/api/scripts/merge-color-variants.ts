/**
 * One-off: fold color variants of the same product into one canonical product.
 *
 * Stores name colors differently ("Black" / "Awesome Graphite" / "Midnight"),
 * so with one product per color the same phone almost never lined up across
 * stores. Products are grouped by category + brand + model + storage + RAM
 * (extracted fresh from each title), and inside a group a product only joins
 * another if every matcher guard except color passes -- so "A56" never absorbs
 * "A56 Pro", 8GB never absorbs 12GB, and new never absorbs refurbished.
 *
 * The product with the most listings is kept; the others' listings, price
 * history and references move onto it, and its title loses the color. The
 * emptied products stay (links to them keep resolving) but drop out of search.
 *
 *   ts-node scripts/merge-color-variants.ts            # report only
 *   ts-node scripts/merge-color-variants.ts --apply    # write, plus a rollback file
 */
import { writeFileSync } from 'fs';
import { MatchStatus, PrismaClient } from '@prisma/client';
import { NormalizerService } from '../src/matching/normalizer.service';
import { FuzzyMatcherService } from '../src/matching/fuzzy-matcher.service';

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();
const normalizer = new NormalizerService();
const matcher = new FuzzyMatcherService();

// Same palette the normalizer extracts, plus the marketing words stores put in
// front of it ("Awesome", "Phantom", "Cosmic"...).
const COLOR_WORDS =
  'black|white|silver|gold|midnight|starlight|blue|red|green|violet|purple|lavender|titanium|natural|graphite|pink|yellow|orange|bronze|coral|mint|sage|burgundy|maroon|beige|cream|navy|teal|olive|gray|grey|charcoal|lightgray|lightgrey|icyblue|ultramarine';
const COLOR_PHRASE = new RegExp(
  `(\\s*[-,/|]\\s*)?\\b(?:(?:awesome|phantom|cosmic|deep|mist|sky|baby|space|jet|matte|rose|alpine|midnight|light|dark|icy|dusk|forest|titanium|natural|desert|comet|tidal|nightly|ocean|glacier|aurora|sunset|emerald|lake|frost|moonlight|starry|pearl)\\s+)*(?:${COLOR_WORDS})\\b`,
  'gi',
);

function stripColor(title: string): string {
  const stripped = title
    .replace(COLOR_PHRASE, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s*[-,/|]\s*(?=[-,/|]|$)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Never produce something unrecognisable from an over-eager strip.
  return stripped.length >= 8 ? stripped : title;
}

function norm(value: string | undefined | null): string {
  return (value ?? '').toLowerCase().replace(/\s+/g, '');
}

type Product = {
  id: string;
  title: string;
  categoryId: string;
  brand: string | null;
  model: string | null;
  listings: number;
  /** Median accepted price, or null when it has none. */
  price: number | null;
};

/**
 * Colors of one product cost about the same. A part that names the product
 * ("Keyboard For Apple MacBook Pro") passes every title guard but not this.
 */
const MAX_PRICE_RATIO = 1.8;

function compatible(a: Product, b: Product): boolean {
  if (a.price != null && b.price != null && Math.max(a.price, b.price) / Math.min(a.price, b.price) > MAX_PRICE_RATIO) {
    return false;
  }
  const ea = normalizer.extractAttributes(a.title);
  const eb = normalizer.extractAttributes(b.title);
  return !(
    normalizer.isAccessory(a.title) !== normalizer.isAccessory(b.title) ||
    matcher.detectProductTypeConflict(a.title, b.title) ||
    matcher.detectChipConflict(a.title, b.title) ||
    matcher.detectVariantConflict(a.title, b.title) ||
    matcher.detectModelCodeSuffixConflict(a.title, b.title) ||
    matcher.detectDisjointModelConflict(a.title, b.title) ||
    matcher.detectConditionConflict(a.title, b.title) ||
    matcher.detectStorageConflict(ea.storage ?? undefined, eb.storage) ||
    matcher.detectRamConflict(ea.ram ?? undefined, eb.ram) ||
    matcher.detectDisplaySizeConflict(ea.displaySize ?? undefined, eb.displaySize)
  );
}

async function main() {
  const rows = await prisma.canonicalProduct.findMany({
    where: {
      model: { not: null },
      sourceListings: { some: { matchStatus: { in: [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT] } } },
    },
    select: {
      id: true,
      title: true,
      categoryId: true,
      brand: true,
      model: true,
      _count: { select: { sourceListings: true } },
      sourceListings: {
        where: { matchStatus: { in: [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT] }, priceUsd: { gt: 0 } },
        select: { priceUsd: true },
      },
    },
  });
  const products: Product[] = rows
    .filter((r) => (r.model ?? '').trim() !== '')
    .map(({ sourceListings, _count, ...r }) => {
      const prices = sourceListings.map((l) => Number(l.priceUsd)).sort((x, y) => x - y);
      const mid = Math.floor(prices.length / 2);
      const price = prices.length ? (prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2) : null;
      return { ...r, listings: _count.sourceListings, price };
    });

  const groups = new Map<string, Product[]>();
  for (const product of products) {
    const attrs = normalizer.extractAttributes(product.title);
    const key = [product.categoryId, norm(product.brand), norm(product.model), norm(attrs.storage), norm(attrs.ram)].join('|');
    const group = groups.get(key) ?? [];
    group.push(product);
    groups.set(key, group);
  }

  const merges: Array<{ keep: Product; absorb: Product[]; newTitle: string }> = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => b.listings - a.listings);
    const clusters: Product[][] = [];
    for (const product of group) {
      const home = clusters.find((cluster) => cluster.every((member) => compatible(member, product)));
      if (home) home.push(product);
      else clusters.push([product]);
    }
    for (const [keep, ...absorb] of clusters) {
      if (absorb.length) merges.push({ keep, absorb, newTitle: stripColor(keep.title) });
    }
  }

  const absorbed = merges.reduce((n, m) => n + m.absorb.length, 0);
  console.log(`products with a model: ${products.length}`);
  console.log(`merges: ${merges.length} products absorb ${absorbed} color variants`);
  for (const m of merges.sort(() => Math.random() - 0.5).slice(0, 10)) {
    console.log(`\n  KEEP  ${m.keep.title.slice(0, 80)}\n  TITLE ${m.newTitle.slice(0, 80)}`);
    for (const a of m.absorb.slice(0, 3)) console.log(`   + ${a.title.slice(0, 80)}`);
  }

  if (!apply) {
    console.log('\nreport only; re-run with --apply to write');
    return;
  }

  const rollback: Array<{ keep: string; oldTitle: string; absorbed: Array<{ id: string; listingIds: string[] }> }> = [];
  for (const m of merges) {
    const entry = { keep: m.keep.id, oldTitle: m.keep.title, absorbed: [] as Array<{ id: string; listingIds: string[] }> };
    for (const a of m.absorb) {
      const listings = await prisma.sourceListing.findMany({ where: { canonicalProductId: a.id }, select: { id: true } });
      entry.absorbed.push({ id: a.id, listingIds: listings.map((l) => l.id) });
    }
    rollback.push(entry);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rollbackPath = `${process.env.ROLLBACK_DIR ?? '/tmp'}/merge-color-variants-${stamp}.json`;
  writeFileSync(rollbackPath, JSON.stringify(rollback, null, 2));

  // Every table that points at a product follows it onto the kept one.
  const tables = [
    'source_listings',
    'price_history',
    'affiliate_clicks',
    'competitor_events',
    'price_alerts',
    'product_discoveries',
    'review_queue',
    'seller_products',
    'watchlist_items',
  ];
  for (const m of merges) {
    const ids = m.absorb.map((a) => a.id);
    await prisma.$transaction([
      ...tables.map((table) =>
        prisma.$executeRawUnsafe(
          `UPDATE ${table} SET canonical_product_id = $1 WHERE canonical_product_id = ANY($2::text[])`,
          m.keep.id,
          ids,
        ),
      ),
      prisma.canonicalProduct.update({
        where: { id: m.keep.id },
        data: { title: m.newTitle, normalizedTitle: normalizer.normalizeTitle(m.newTitle).normalized },
      }),
    ]);
  }
  console.log(`\napplied ${merges.length} merges (${absorbed} products folded in). rollback data: ${rollbackPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
