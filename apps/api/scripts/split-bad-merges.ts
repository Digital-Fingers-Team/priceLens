import { PrismaClient, Prisma } from '@prisma/client';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';

const prisma = new PrismaClient();

// Mirrors normalizer.service.ts — kept standalone so this one-off script has no
// dependency on the Nest app being built.
function isAccessory(title: string): boolean {
  const patterns = [
    /\b(case|cover|sleeve|bag|holster)\b/i,
    /\b(charger|cable|adapter|cord|wire)\b/i,
    /\b(screen protector|tempered glass|film)\b/i,
    /\b(stand|mount|dock|hub|splitter)\b/i,
    /\b(skin|wrap|sticker|decal)\b/i,
    /\b(replacement\s+(?:battery|part|screen))\b/i,
    /\b(compatible with|for use with|fits)\b/i,
  ];
  return patterns.some((p) => p.test(title));
}

const COLORS = [
  'cosmic orange', 'cobalt violet', 'sky blue', 'deep blue', 'mist blue', 'navy blue', 'baby blue',
  'awesome graphite', 'awesome violet', 'awesome black', 'awesome white',
  'phantom black', 'phantom violet', 'phantom white',
  'space gray', 'space grey', 'space black', 'rose gold', 'jet black', 'matte black',
  'midnight green', 'alpine green', 'sage green',
  'black', 'white', 'silver', 'gold', 'midnight', 'starlight', 'blue', 'red', 'green', 'violet',
  'purple', 'lavender', 'titanium', 'natural', 'graphite', 'pink', 'yellow', 'orange', 'bronze',
  'coral', 'mint', 'sage', 'burgundy', 'maroon', 'beige', 'cream', 'navy', 'teal', 'olive', 'gray', 'grey',
];

function extractColor(title: string): string | undefined {
  const lower = title.toLowerCase();
  return COLORS.find((c) => lower.includes(c));
}

function toSlug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
}

async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let suffix = 1;
  while (await prisma.canonicalProduct.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
  return slug;
}

async function embed(text: string): Promise<number[] | null> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text.slice(0, 8000) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { embedding: number[] };
    return Array.isArray(data.embedding) ? data.embedding : null;
  } catch (err) {
    console.error(`  embed failed: ${(err as Error).message}`);
    return null;
  }
}

async function main() {
  const products = await prisma.canonicalProduct.findMany({
    include: { sourceListings: true },
  });

  let splitCount = 0;

  for (const product of products) {
    if (product.sourceListings.length <= 1) continue;

    const productIsAccessory = isAccessory(product.title);
    const productColor = extractColor(product.title);

    for (const listing of product.sourceListings) {
      const listingIsAccessory = isAccessory(listing.rawTitle);
      const listingColor = extractColor(listing.rawTitle);

      const accessoryMismatch = listingIsAccessory !== productIsAccessory;
      const colorMismatch = !!listingColor && !!productColor && listingColor !== productColor;

      if (!accessoryMismatch && !colorMismatch) continue;

      console.log(
        `Splitting "${listing.rawTitle.slice(0, 70)}" out of "${product.title.slice(0, 60)}" ` +
        `(accessoryMismatch=${accessoryMismatch}, colorMismatch=${colorMismatch})`,
      );

      const baseSlug = toSlug(listing.rawTitle) || `product-${listing.externalId}`;
      const slug = await ensureUniqueSlug(baseSlug);
      const existingAttrs = (listing.extractedAttributes ?? {}) as Record<string, unknown>;

      const newProduct = await prisma.canonicalProduct.create({
        data: {
          categoryId: product.categoryId,
          slug,
          title: listing.rawTitle,
          normalizedTitle: (listing.normalizedTitle ?? listing.rawTitle).toLowerCase(),
          brand: listing.extractedBrand ?? listing.rawBrand ?? null,
          model: listing.extractedModel ?? null,
          gtin: listing.extractedGtin ?? null,
          upc: listing.extractedUpc ?? null,
          ean: listing.extractedEan ?? null,
          mpn: listing.extractedMpn ?? null,
          attributes: { ...existingAttrs, color: listingColor ?? existingAttrs.color ?? null } as Prisma.InputJsonValue,
          imageUrl: listing.rawImageUrl,
          thumbnailUrl: listing.rawImageUrl,
          tier: product.tier,
          isVerified: false,
        },
      });

      await prisma.sourceListing.update({
        where: { id: listing.id },
        data: { canonicalProductId: newProduct.id },
      });

      await prisma.priceHistory.updateMany({
        where: { sourceListingId: listing.id },
        data: { canonicalProductId: newProduct.id },
      });

      const embedding = await embed(listing.rawTitle);
      if (embedding) {
        const vectorStr = `[${embedding.join(',')}]`;
        await prisma.$executeRaw`
          UPDATE canonical_products SET title_embedding = ${vectorStr}::vector WHERE id = ${newProduct.id}
        `;
      }

      splitCount += 1;
    }
  }

  console.log(`Done. Split ${splitCount} mismatched listings into their own canonical products.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
