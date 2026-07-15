// One-off fix: split specific source_listings back out of a canonical product
// they were wrongly merged into (small-LLM judge missed a model-number/size
// digit difference — see session notes). Recreates a standalone canonical
// product from the listing's own raw data and reassigns its price history.
import { PrismaClient } from '@prisma/client';
import { NormalizerService } from '../src/matching/normalizer.service';

const LISTING_IDS_TO_SPLIT = [
  'bf16af81-2774-47b7-8a49-92afbe66e3cf', // AMD Ryzen 7 7700 (wrongly merged into 7700X)
  'dc1f9269-a26d-4cdb-a466-f93aec1cd9a8', // LG 24-inch monitor (wrongly merged into 27-inch)
  '4bb5ff10-4038-4d53-a44e-0e0b42c6369a', // Philips 271V8LB 27" (wrongly merged into 241V8LB 24")
  'bd6b469c-6a31-4aeb-89ad-32c21fec8d0c', // Samsung F6000 TV (wrongly merged into H5000F)
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
