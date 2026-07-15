import { PrismaClient } from '@prisma/client';
import { NormalizerService } from '../src/matching/normalizer.service';

async function main() {
  const prisma = new PrismaClient();
  const normalizer = new NormalizerService();

  const products = await prisma.canonicalProduct.findMany({
    select: { id: true, title: true, brand: true },
  });

  let updated = 0;
  for (const product of products) {
    const recomputed = normalizer.extractAttributes(product.title).brand ?? null;
    if (recomputed !== product.brand) {
      await prisma.canonicalProduct.update({
        where: { id: product.id },
        data: { brand: recomputed },
      });
      console.log(`"${product.title}": ${product.brand ?? '(null)'} -> ${recomputed ?? '(null)'}`);
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
