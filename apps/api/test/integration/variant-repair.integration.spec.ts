import { MatchStatus, PrismaClient } from '@prisma/client';
import {
  applyVariantSplits,
  findVariantMixes,
  rollbackVariantSplits,
} from '../../src/matching/repair/variant-repair';
import { upsertCategories } from '../../seed/generators/generateProducts';
import { generateStores } from '../../seed/generators/generateStores';

/**
 * The repair tool against a real database: a product holding 8GB and 12GB
 * A57 listings (with price history) is split, then rolled back exactly.
 * Requires the local *_test database (global setup enforces it).
 */
describe('variant repair (integration)', () => {
  const prisma = new PrismaClient();
  const slug = `repair-a57-${Date.now()}`;
  let productId: string;
  const listingIds: Record<string, string> = {};

  beforeAll(async () => {
    const categories = await upsertCategories(prisma);
    const stores = await generateStores(prisma);
    const product = await prisma.canonicalProduct.create({
      data: {
        slug,
        title: 'Samsung Galaxy A57 5G',
        normalizedTitle: 'samsung galaxy a57 5g',
        brand: 'Samsung',
        model: 'Galaxy A57',
        categoryId: categories.get('smartphones')!,
      },
    });
    productId = product.id;

    const titles: Record<string, [string, string]> = {
      'jumia-8': ['jumia', 'Galaxy A57 Dual SIM 5G 256GB/8GB - Awesome Navy'],
      'noon-8': ['noon', 'Samsung Galaxy A57 Dual SIM Awesome Gray 8GB RAM 256GB 5G'],
      'jumia-12': ['jumia', 'Galaxy A57 Dual SIM 5G 256GB/12GB - Awesome Gray'],
      'noon-12': ['noon', 'Samsung Galaxy A57 Dual SIM Awesome Navy 12GB RAM 256GB 5G'],
      '2b-12': ['2b', 'Samsung Galaxy A57 5G - 12GB RAM - 256GB - Gray'],
    };
    for (const [key, [store, rawTitle]] of Object.entries(titles)) {
      const listing = await prisma.sourceListing.create({
        data: {
          platformId: stores.get(store)!.id,
          canonicalProductId: productId,
          externalId: `${slug}-${key}`,
          externalUrl: `https://example.test/${key}`,
          rawTitle,
          priceUsd: 27000,
          rawCurrency: 'EGP',
          matchStatus: MatchStatus.ACCEPTED,
        },
      });
      listingIds[key] = listing.id;
      await prisma.priceHistory.create({
        data: { canonicalProductId: productId, sourceListingId: listing.id, priceUsd: 27000, currency: 'EGP' },
      });
    }
  });

  afterAll(async () => {
    await prisma.priceHistory.deleteMany({ where: { sourceListingId: { in: Object.values(listingIds) } } });
    await prisma.sourceListing.deleteMany({ where: { id: { in: Object.values(listingIds) } } });
    await prisma.canonicalProduct.deleteMany({ where: { slug: { startsWith: slug } } });
    await prisma.$disconnect();
  });

  it('reports, splits with history, and rolls back exactly', async () => {
    const reports = await findVariantMixes(prisma, { productSlug: slug });
    expect(reports).toHaveLength(1);
    expect(reports[0].plan.keep.variant).toEqual({ ram: '12GB' });

    const rollback = await applyVariantSplits(prisma, reports);
    expect(rollback).toHaveLength(1);
    const newId = rollback[0].newProductId;

    const moved = await prisma.sourceListing.findMany({ where: { canonicalProductId: newId } });
    expect(moved.map((l) => l.id).sort()).toEqual([listingIds['jumia-8'], listingIds['noon-8']].sort());
    expect(await prisma.priceHistory.count({ where: { canonicalProductId: newId } })).toBe(2);
    expect(await prisma.sourceListing.count({ where: { canonicalProductId: productId } })).toBe(3);
    const created = await prisma.canonicalProduct.findUniqueOrThrow({ where: { id: newId } });
    expect(created.slug).toBe(`${slug}-8gb-ram`);

    // Nothing left to split.
    expect(await findVariantMixes(prisma, { productSlug: slug })).toHaveLength(0);

    const result = await rollbackVariantSplits(prisma, rollback);
    expect(result).toEqual({ restored: 2, keptProducts: [] });
    expect(await prisma.sourceListing.count({ where: { canonicalProductId: productId } })).toBe(5);
    expect(await prisma.priceHistory.count({ where: { canonicalProductId: productId } })).toBe(5);
    expect(await prisma.canonicalProduct.findUnique({ where: { id: newId } })).toBeNull();
  });
});
