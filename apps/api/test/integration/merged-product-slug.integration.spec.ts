import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { ProductsService } from '../../src/products/products.service';

/**
 * A product merged into another by reconciliation keeps working at its old
 * URL (audit 09, SEO-09): getBySlug returns the product it was merged into,
 * following chains of merges; an undone merge does not count.
 *
 * Requires DATABASE_URL pointing at a migrated database.
 */
describe('merged product slugs (integration)', () => {
  const run = `mergeslug-${Date.now().toString(36)}`;
  let prisma: PrismaClient;
  let service: ProductsService;
  let categoryId: string;
  const ids: Record<string, string> = {};

  const config = { get: (_key: string, fallback?: unknown) => fallback } as ConfigService;
  const queue = { enqueueStoreExpansion: jest.fn(async () => undefined) };

  async function product(key: string) {
    const created = await prisma.canonicalProduct.create({
      data: { categoryId, slug: `${run}-${key}`, title: `Product ${key}`, normalizedTitle: `product ${key}` },
    });
    ids[key] = created.id;
    return created;
  }

  async function merge(kept: string, mergedKey: string, undone = false) {
    await prisma.productMerge.create({
      data: {
        keptProductId: kept,
        mergedProductId: `${run}-gone-${mergedKey}`,
        keptTitle: 'kept',
        mergedTitle: 'merged',
        mergedSnapshot: { slug: `${run}-${mergedKey}`, id: `${run}-gone-${mergedKey}` },
        decidedBy: 'rules',
        undoneAt: undone ? new Date() : null,
      },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    service = new ProductsService(prisma as never, config, queue as never);
    categoryId = (await prisma.category.create({ data: { slug: `${run}-cat`, name: `Merged ${run}`, searchTerms: [] } })).id;

    // old-a was merged into keeper.
    const keeper = await product('keeper');
    await merge(keeper.id, 'old-a');
    // old-b was merged into a product that was itself merged into final.
    const final = await product('final');
    await prisma.productMerge.create({
      data: {
        keptProductId: `${run}-gone-mid`,
        mergedProductId: `${run}-gone-old-b`,
        keptTitle: 'mid',
        mergedTitle: 'old-b',
        mergedSnapshot: { slug: `${run}-old-b` },
        decidedBy: 'rules',
      },
    });
    await prisma.productMerge.create({
      data: {
        keptProductId: final.id,
        mergedProductId: `${run}-gone-mid`,
        keptTitle: 'final',
        mergedTitle: 'mid',
        mergedSnapshot: { slug: `${run}-mid` },
        decidedBy: 'rules',
      },
    });
    // old-c's merge was undone.
    await merge(keeper.id, 'old-c', true);
  });

  afterAll(async () => {
    await prisma.productMerge.deleteMany({ where: { mergedTitle: { in: ['merged', 'old-b', 'mid'] }, keptTitle: { in: ['kept', 'mid', 'final'] } } });
    await prisma.canonicalProduct.deleteMany({ where: { categoryId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it('answers an old slug with the product it was merged into', async () => {
    const product = await service.getBySlug(`${run}-old-a`);
    expect(product.id).toBe(ids.keeper);
    expect(product.slug).toBe(`${run}-keeper`);
  });

  it('follows a chain of merges to the product that exists now', async () => {
    const product = await service.getBySlug(`${run}-old-b`);
    expect(product.id).toBe(ids.final);
  });

  it('ignores an undone merge and a slug that was never merged', async () => {
    await expect(service.getBySlug(`${run}-old-c`)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getBySlug(`${run}-never-existed`)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('still answers a live slug directly', async () => {
    const product = await service.getBySlug(`${run}-final`);
    expect(product.slug).toBe(`${run}-final`);
  });
});
