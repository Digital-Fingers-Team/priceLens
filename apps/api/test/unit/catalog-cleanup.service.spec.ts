import { ConfigService } from '@nestjs/config';
import { CatalogCleanupService } from '../../src/matching/catalog-cleanup.service';
import { FuzzyMatcherService } from '../../src/matching/fuzzy-matcher.service';
import { NormalizerService } from '../../src/matching/normalizer.service';
import { ReconciliationService } from '../../src/matching/reconciliation.service';

type AnyRec = Record<string, any>;

function product(id: string, title: string, overrides: AnyRec = {}): AnyRec {
  return {
    id,
    categoryId: 'headphones-id',
    title,
    normalizedTitle: title.toLowerCase(),
    brand: 'Samsung',
    model: null,
    gtin: null,
    upc: null,
    ean: null,
    mpn: null,
    attributes: {},
    createdAt: new Date('2026-09-29'),
    ...overrides,
  };
}

/**
 * The queries in the order run() makes them: empty products, then
 * identical-title groups, then (dry run) the history count.
 */
function fakePrisma(state: { products: AnyRec[]; empty: AnyRec[]; groups: Array<{ ids: string[] }>; staleHistory: number }) {
  const queries = [state.empty, state.groups, [{ n: BigInt(state.staleHistory) }]];
  return {
    category: { findUnique: jest.fn().mockResolvedValue({ id: 'phone-accessories-id' }) },
    canonicalProduct: {
      findMany: jest.fn(async ({ where }: AnyRec) =>
        where.id ? state.products.filter((p) => where.id.in.includes(p.id)) : state.products.filter((p) => p.categoryId !== where.categoryId.not),
      ),
      findUnique: jest.fn(async ({ where }: AnyRec) => state.products.find((p) => p.id === where.id) ?? null),
      updateMany: jest.fn(),
    },
    sourceListing: { count: jest.fn().mockResolvedValue(0) },
    $queryRaw: jest.fn(async () => queries.shift()),
    $executeRaw: jest.fn().mockResolvedValue(0),
  };
}

describe('CatalogCleanupService', () => {
  const config = { get: (_k: string, d?: unknown) => d } as unknown as ConfigService;
  const reconciliation = new ReconciliationService(config, {} as any, {} as any, new FuzzyMatcherService(), new NormalizerService());

  it('reports without changing anything on a dry run', async () => {
    const caseTitle = 'Clear MagSafe-Compatible TPU Case for Samsung Galaxy A05S - Pink';
    const prisma = fakePrisma({
      products: [
        product('case-hp', caseTitle),
        product('case-sw', caseTitle, { categoryId: 'smart-watches-id' }),
        product('buds', 'Samsung Galaxy Buds 3 Pro'),
        // Same model name, different brands: the guards keep them apart.
        product('x-a', 'Pad 7 128GB', { brand: 'Xiaomi' }),
        product('x-b', 'Pad 7 128GB', { brand: 'Lenovo' }),
      ],
      empty: [{ id: 'old-copy', target: 'case-sw' }, { id: 'never-used', target: null }],
      groups: [{ ids: ['case-sw', 'case-hp'] }, { ids: ['x-a', 'x-b'] }],
      staleHistory: 7,
    });
    const merge = jest.spyOn(reconciliation, 'mergeCanonicals').mockResolvedValue();

    const report = await new CatalogCleanupService(prisma as any, reconciliation).run();

    expect(report.recategorized.map((move) => move.productId)).toEqual(['case-hp', 'case-sw']);
    expect(report).toMatchObject({
      apply: false,
      emptiedMerged: 1,
      emptyDeleted: 1,
      identicalMerged: 1,
      identicalKeptApart: 1,
      historyRepointed: 7,
    });
    expect(prisma.canonicalProduct.updateMany).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(merge).not.toHaveBeenCalled();
  });

  it('merges into the copy listed first (most listings) and skips products gone meanwhile', async () => {
    const title = 'Liquid Silicone Case for Samsung Galaxy A17';
    const prisma = fakePrisma({
      products: [product('keep', title), product('dup', title)],
      empty: [{ id: 'vanished', target: 'keep' }],
      groups: [{ ids: ['keep', 'dup'] }],
      staleHistory: 0,
    });
    const merge = jest.spyOn(reconciliation, 'mergeCanonicals').mockResolvedValue();

    const report = await new CatalogCleanupService(prisma as any, reconciliation).run({ apply: true });

    expect(merge).toHaveBeenCalledTimes(1);
    expect(merge.mock.calls[0][0].id).toBe('keep');
    expect(merge.mock.calls[0][1].id).toBe('dup');
    expect(merge.mock.calls[0][2]).toBe('cleanup');
    expect(report.emptiedMerged).toBe(0);
    expect(report.identicalMerged).toBe(1);
  });
});
