// One-off fix: split specific source_listings back out of a canonical product
// they were wrongly merged into (small-LLM judge missed a model-number/size
// digit difference — see session notes). Recreates a standalone canonical
// product from the listing's own raw data and reassigns its price history.
import { PrismaClient } from '@prisma/client';
import { NormalizerService } from '../src/matching/normalizer.service';

const LISTING_IDS_TO_SPLIT = [
  'd30350ee-1787-4054-bd9e-9e8554484626', // Samsung Galaxy A37 "Awesome Lavender" (wrongly merged into "Awesome Charcoal" -- "charcoal" was missing from the color dict)
  'dba04bab-864b-4751-8da6-65c5fe09fccf', // Samsung Galaxy S26 Ultra "Cobalt Violet" (wrongly merged into "Black" -- hasHardConflict trusted stale stored attributes instead of re-extracting from title)
];

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function inferTier(priceUsd: number | null): 'BUDGET' | 'MID_RANGE' | 'PREMIUM' | 'ULTRA_PREMIUM' {
  if (priceUsd == null) return 'MID_RANGE';
  if (priceUsd < 300) return 'BUDGET';
  if (priceUsd < 900) return 'MID_RANGE';
  if (priceUsd < 1800) return 'PREMIUM';
  return 'ULTRA_PREMIUM';
}

async function main() {
  const prisma = new PrismaClient();
  const normalizer = new NormalizerService();

  for (const listingId of LISTING_IDS_TO_SPLIT) {
    const listing = await prisma.sourceListing.findUnique({
      where: { id: listingId },
      include: { canonicalProduct: true, platform: true },
    });
    if (!listing) {
      console.log(`SKIP ${listingId}: listing not found`);
      continue;
    }

    const normalized = normalizer.normalizeTitle(listing.rawTitle);
    const extracted = normalizer.extractAttributes(listing.rawTitle, {
      brand: listing.rawBrand ?? undefined,
      gtin: listing.extractedGtin ?? undefined,
      upc: listing.extractedUpc ?? undefined,
      ean: listing.extractedEan ?? undefined,
      mpn: listing.extractedMpn ?? undefined,
    });

    const baseSlug = toSlug([listing.extractedBrand, listing.extractedModel, listing.rawTitle].filter(Boolean).join(' '));
    let slug = baseSlug || `product-${listing.externalId}`;
    let suffix = 1;
    while (await prisma.canonicalProduct.findUnique({ where: { slug } })) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    const priceUsd = listing.priceUsd ? Number(listing.priceUsd) : null;

    const newProduct = await prisma.canonicalProduct.create({
      data: {
        categoryId: listing.canonicalProduct!.categoryId,
        slug,
        title: listing.rawTitle,
        normalizedTitle: normalized.normalized,
        brand: listing.extractedBrand ?? extracted.brand ?? null,
        model: listing.extractedModel ?? extracted.model ?? null,
        gtin: listing.extractedGtin,
        upc: listing.extractedUpc,
        ean: listing.extractedEan,
        mpn: listing.extractedMpn,
        attributes: extracted as any,
        imageUrl: listing.rawImageUrl,
        thumbnailUrl: listing.rawImageUrl,
        tier: inferTier(priceUsd),
        isVerified: false,
      },
    });

    const oldCanonicalId = listing.canonicalProductId!;

    await prisma.$transaction([
      prisma.sourceListing.update({
        where: { id: listing.id },
        data: { canonicalProductId: newProduct.id },
      }),
      prisma.priceHistory.updateMany({
        where: { sourceListingId: listing.id },
        data: { canonicalProductId: newProduct.id },
      }),
    ]);

    console.log(
      `SPLIT "${listing.rawTitle}" (${listing.platform.slug}) out of ${oldCanonicalId} -> new canonical ${newProduct.id} (slug: ${slug})`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
