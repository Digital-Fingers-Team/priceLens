import type { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import type { Category, Platform } from '@prisma/client';
import { FuzzyMatcherService } from '../../src/matching/fuzzy-matcher.service';
import { NormalizerService } from '../../src/matching/normalizer.service';
import { ReconciliationService } from '../../src/matching/reconciliation.service';

/**
 * Reconciliation with an AI judge that comes and goes, on real Postgres:
 * - judge unavailable: nothing merges (owner decision 2026-09-29);
 * - merges the rules made alone before that decision are still reviewed by
 *   the judge (reviewUnreviewedMerges) and undone when it says no;
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

  const settings: Record<string, unknown> = {
    'search.reconciliationDryRun': false,
    'search.reconciliationMaxPairs': 5000,
    'search.reconciliationSimilarityThreshold': 0.3,
    'search.reconciliationNeighborsPerProduct': 8,
  };
  const config = { get: (key: string, fallback?: unknown) => settings[key] ?? fallback } as ConfigService;

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

  it('merges nothing while the judge is down, however strongly the rules agree (owner decision 2026-09-29)', async () => {
    judge.available = false;
    const older = await product(`Infinix Zero 40 8GB RAM 256GB Black ${run}`, 'Infinix', new Date('2026-01-01'));
    const newer = await product(`Infinix Zero 40 8GB RAM 256GB Blue ${run}`, 'Infinix', new Date('2026-02-01'));

    const report = await service().reconcile();

    expect(report.merges.some((m) => m.mergeId === newer.id || m.keepId === newer.id)).toBe(false);
    expect(await prisma.canonicalProduct.count({ where: { id: { in: [older.id, newer.id] } } })).toBe(2);
    expect(await prisma.productMerge.count({ where: { mergedProductId: newer.id } })).toBe(0);
  });

  it('merges on the judge\'s "yes", including a pair the rules could not read', async () => {
    judge.available = true;
    const a = await product(`Infinix Note 50 8GB RAM 256GB Black ${run}`, 'Infinix', new Date('2026-01-01'));
    const b = await product(`Infinix Note 50 8GB RAM 256GB Gold ${run}`, 'Infinix', new Date('2026-02-01'));
    answer(b.title, a.title, true);
    // No model the rules can read in either title; only the judge can say.
    const c = await product(`Infinix flagship phone 8GB RAM 256GB edition one ${run}`, 'Infinix', new Date('2026-01-01'));
    const d = await product(`Infinix flagship phone 8GB RAM 256GB edition one special ${run}`, 'Infinix', new Date('2026-02-01'));
    answer(c.title, d.title, true);

    const report = await service().reconcile();

    expect(report.merges.find((m) => m.mergeId === b.id)).toMatchObject({ keepId: a.id, decidedBy: 'ai' });
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

  it('looks for look-alike titles around the newest products only', async () => {
    // Prod, 2026-09-29: the look-alike search over all 33k products ran 38
    // minutes and its lock froze a migration and the site behind it. New
    // duplicates come from new products; brand+model pairs still cover all.
    judge.available = true;
    const old = await product(`Infinix budget phone 4GB RAM 64GB edition two ${run}`, 'Infinix', new Date('2020-01-01'));
    const oldTwin = await product(`Infinix budget phone 4GB RAM 64GB edition two special ${run}`, 'Infinix', new Date('2020-02-01'));
    answer(old.title, oldTwin.title, true);
    // The newest product anywhere in the table.
    await product(`Unrelated kettle ${run}`, 'Kenwood', new Date(Date.now() + 86_400_000));

    settings['search.reconciliationTrigramAnchors'] = 1;
    try {
      const report = await service().reconcile();
      expect(report.merges.some((m) => m.mergeId === oldTwin.id)).toBe(false);
    } finally {
      delete settings['search.reconciliationTrigramAnchors'];
    }

    const report = await service().reconcile();
    expect(report.merges.find((m) => m.mergeId === oldTwin.id)).toMatchObject({ keepId: old.id });
  });
});
