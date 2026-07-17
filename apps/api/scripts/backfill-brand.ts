import { PrismaClient } from '@prisma/client';
import { NormalizerService } from '../src/matching/normalizer.service';

async function main() {
  const prisma = new PrismaClient();
  const normalizer = new NormalizerService();

  const products = await prisma.canonicalProduct.findMany({
    select: { id: true, title: true, brand: true, attributes: true },
  });

  let updated = 0;
  for (const product of products) {
    const recomputed = normalizer.extractAttributes(product.title).brand ?? null;

    // The header's "Brand: X" chip renders from the stored `attributes.brand`,
    // not the top-level `brand` column, so a stale attributes.brand (e.g. the
    // color "Sapphire" wrongly captured before the brand-extraction startsWith
    // fix) survives even after `brand` is corrected. Fix both, merging into
    // attributes so other scraped keys (color/storage/ram) are preserved.
    const attrs = (product.attributes ?? {}) as Record<string, unknown>;
    const attrsBrandStale =
      typeof attrs.brand === 'string' && attrs.brand !== (recomputed ?? undefined);

    if (recomputed !== product.brand || attrsBrandStale) {
      const data: { brand: string | null; attributes?: Record<string, unknown> } = {
        brand: recomputed,
      };
      if (attrsBrandStale) {
        data.attributes = recomputed
          ? { ...attrs, brand: recomputed }
          : (() => {
              const { brand: _drop, ...rest } = attrs;
              return rest;
            })();
      }
      await prisma.canonicalProduct.update({
        where: { id: product.id },
        data: data as never,
      });
      console.log(
        `"${product.title}": brand ${product.brand ?? '(null)'} -> ${recomputed ?? '(null)'}` +
          (attrsBrandStale ? ` (attr "${String(attrs.brand)}" -> ${recomputed ?? '(removed)'})` : ''),
      );
      updated += 1;
    }
  }

  console.log(`\nUpdated ${updated}/${products.length} canonical products.`);

  const listings = await prisma.sourceListing.findMany({
    select: { id: true, rawTitle: true, extractedBrand: true },
  });

  let listingsUpdated = 0;
  for (const listing of listings) {
    const recomputed = normalizer.extractAttributes(listing.rawTitle).brand ?? null;
    if (recomputed !== listing.extractedBrand) {
      await prisma.sourceListing.update({
        where: { id: listing.id },
        data: { extractedBrand: recomputed },
      });
      listingsUpdated += 1;
    }
  }

  console.log(`Updated ${listingsUpdated}/${listings.length} source listings.`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
