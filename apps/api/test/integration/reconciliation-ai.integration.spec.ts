import type { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import type { Category, Platform } from '@prisma/client';
import { FuzzyMatcherService } from '../../src/matching/fuzzy-matcher.service';
import { NormalizerService } from '../../src/matching/normalizer.service';
import { ReconciliationService } from '../../src/matching/reconciliation.service';

/**
 * Reconciliation with an AI judge that comes and goes, on real Postgres:
 * - judge unavailable: the code rules merge alone, logged as unreviewed;
 * - judge back: it reviews those merges and undoes the ones it rejects,
 *   restoring the product, its listings and their price history;
 * - judge available: its "no" blocks a merge the rules approve, and its
 *   "yes" merges a pair the rules could not decide.
 */
describe('reconciliation with the AI judge (integration)', () => {
  const run = `recon-${Date.now().toString(36)}`;
  let prisma: PrismaClient;
  let category: Category;
  let platform: Platform;
  const judge = { available: false, answers: new Map<string, boolean>() };

  // Like SemanticService: an answer the judge gave is kept and still counts
  // while it is down; a pair it was never asked about has no answer then.
  const given = new Map<string, boolean>();
  const semantic = {
    isAvailable: () => judge.available,
    judgeSameProduct: async (a: string, b: string) => {
      const key = [a, b].sort().join('|');
      if (given.has(key)) return given.get(key)!;
      if (!judge.available || !judge.answers.has(key)) return null;
      given.set(key, judge.answers.get(key)!);
      return given.get(key)!;
    },
  };
  const answer = (a: string, b: string, same: boolean) => judge.answers.set([a, b].sort().join('|'), same);

  const config = {
    get: (key: string, fallback?: unknown) =>
      ({
        'search.reconciliationDryRun': false,
        'search.reconciliationMaxPairs': 5000,
        'search.reconciliationSimilarityThreshold': 0.3,
        'search.reconciliationNeighborsPerProduct': 8,
      })[key] ?? fallback,
  } as ConfigService;

  const service = () =>
    new ReconciliationService(config, prisma as never, semantic as never, new FuzzyMatcherService(), new NormalizerService());

  async function product(title: string, brand: string, createdAt: Date) {
    const normalizer = new NormalizerService();
    const created = await prisma.canonicalProduct.create({
      data: {
        categoryId: category.id,
        slug: `${run}-${Math.random().toString(36).slice(2, 10)}`,
        title,
        normalizedTitle: normalizer.normalizeTitle(title).normalized,
        brand,
        createdAt,
      },
    });
    const listing = await prisma.sourceListing.create({
      data: {
        platformId: platform.id,
        externalId: `${run}-${created.id}`,
        externalUrl: 'https://example.test/x',
        rawTitle: title,
        rawPrice: 1000,
        rawCurrency: 'EGP',
        canonicalProductId: created.id,
      },
    });
    await prisma.priceHistory.create({
      data: { canonicalProductId: created.id, sourceListingId: listing.id, priceUsd: 1000, currency: 'EGP' },
    });
    return { id: created.id, listingId: listing.id, title };
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    category = await prisma.category.create({ data: { slug: `${run}-phones`, name: `Phones ${run}`, level: 1, searchTerms: [] } });
    platform = await prisma.platform.create({
      data: { slug: `${run}-store`, name: 'Store', baseUrl: 'https://example.test', connectorType: 'HTTP_API' },
    });
  });

  afterAll(async () => {
    const products = await prisma.canonicalProduct.findMany({ where: { categoryId: category.id }, select: { id: true } });
    const ids = products.map((p) => p.id);
    await prisma.productMerge.deleteMany({ where: { OR: [{ keptProductId: { in: ids } }, { mergedProductId: { in: ids } }] } });
    await prisma.priceHistory.deleteMany({ where: { sourceListing: { platformId: platform.id } } });
    await prisma.sourceListing.deleteMany({ where: { platformId: platform.id } });
    await prisma.canonicalProduct.deleteMany({ where: { categoryId: category.id } });
    await prisma.platform.delete({ where: { id: platform.id } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.$disconnect();
  });

  it('merges on the rules while the judge is down, then undoes what the judge rejects', async () => {
    judge.available = false;
    const older = await product(`Infinix Zero 40 8GB RAM 256GB Black ${run}`, 'Infinix', new Date('2026-01-01'));
    const newer = await product(`Infinix Zero 40 8GB RAM 256GB Blue ${run}`, 'Infinix', new Date('2026-02-01'));

    const first = await service().reconcile();
    const merge = first.merges.find((m) => m.mergeId === newer.id);
    expect(merge).toMatchObject({ keepId: older.id, decidedBy: 'rules' });
    expect(await prisma.canonicalProduct.findUnique({ where: { id: newer.id } })).toBeNull();
    const logged = await prisma.productMerge.findFirstOrThrow({ where: { mergedProductId: newer.id } });
    expect(logged).toMatchObject({ decidedBy: 'rules', aiVerdict: null, movedListingIds: [newer.listingId] });

    // The judge is back and says the two are different products.
    judge.available = true;
    answer(newer.title, older.title, false);
    await service().reconcile();

    const restored = await prisma.canonicalProduct.findUniqueOrThrow({ where: { id: newer.id } });
    expect(restored.title).toBe(newer.title);
    const listing = await prisma.sourceListing.findUniqueOrThrow({ where: { id: newer.listingId } });
    expect(listing.canonicalProductId).toBe(newer.id);
    expect(await prisma.priceHistory.count({ where: { canonicalProductId: newer.id } })).toBe(1);
    expect(await prisma.priceHistory.count({ where: { canonicalProductId: older.id } })).toBe(1);
    expect(await prisma.productMerge.findUniqueOrThrow({ where: { id: logged.id } })).toMatchObject({
      aiVerdict: false,
      undoneAt: expect.any(Date),
    });

    // And the pair is not merged again: the judge's "no" stands, even while
    // the judge is down and the rules alone would merge it.
    const again = await service().reconcile();
    expect(again.merges.some((m) => m.mergeId === newer.id || m.keepId === newer.id)).toBe(false);
    judge.available = false;
    const whileDown = await service().reconcile();
    expect(whileDown.merges.some((m) => m.mergeId === newer.id || m.keepId === newer.id)).toBe(false);
  });

  it('the judge approves a rules merge on review, and merges a pair the rules could not decide', async () => {
    judge.available = false;
    const a = await product(`Infinix Note 50 8GB RAM 256GB Black ${run}`, 'Infinix', new Date('2026-01-01'));
    const b = await product(`Infinix Note 50 8GB RAM 256GB Gold ${run}`, 'Infinix', new Date('2026-02-01'));
    await service().reconcile();
    const logged = await prisma.productMerge.findFirstOrThrow({ where: { mergedProductId: b.id } });

    judge.available = true;
    answer(b.title, a.title, true);
    // No model the rules can read in either title; only the judge can say.
    const c = await product(`Infinix flagship phone 8GB RAM 256GB edition one ${run}`, 'Infinix', new Date('2026-01-01'));
    const d = await product(`Infinix flagship phone 8GB RAM 256GB edition one special ${run}`, 'Infinix', new Date('2026-02-01'));
    answer(c.title, d.title, true);
    const report = await service().reconcile();

    expect(report.review).toMatchObject({ approved: expect.any(Number), undone: 0 });
    expect(await prisma.productMerge.findUniqueOrThrow({ where: { id: logged.id } })).toMatchObject({
      aiVerdict: true,
      undoneAt: null,
    });
    expect(report.merges.find((m) => m.mergeId === d.id)).toMatchObject({ keepId: c.id, decidedBy: 'ai' });
  });

  it('a "no" from the judge blocks a merge the rules approve', async () => {
    judge.available = true;
    const a = await product(`Infinix Smart 10 4GB RAM 128GB Black ${run}`, 'Infinix', new Date('2026-01-01'));
    const b = await product(`Infinix Smart 10 4GB RAM 128GB White ${run}`, 'Infinix', new Date('2026-02-01'));
    answer(a.title, b.title, false);

    const report = await service().reconcile();
    expect(report.merges.some((m) => m.mergeId === b.id)).toBe(false);
    expect(await prisma.canonicalProduct.count({ where: { id: { in: [a.id, b.id] } } })).toBe(2);
  });
});
