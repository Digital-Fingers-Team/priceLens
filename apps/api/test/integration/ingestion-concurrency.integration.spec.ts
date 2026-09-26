import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import type { Category, Platform } from '@prisma/client';
import { FuzzyMatcherService } from '../../src/matching/fuzzy-matcher.service';
import { FxRatesService } from '../../src/matching/fx-rates.service';
import { NormalizerService } from '../../src/matching/normalizer.service';
import { IngestionRepository } from '../../src/scraping/ingestion/ingestion.repository';
import { ListingProcessor } from '../../src/scraping/ingestion/listing-processor.service';
import type { RetailerListing } from '../../src/scraping/interfaces/retailer-listing.interface';

/**
 * Concurrency (audit 02, L-19): up to 12 ingestion jobs run at once, and two
 * of them can see the same listing or the same new product at the same time.
 * Real Postgres, real repository and processor; the LLM judge is absent.
 */
describe('ingestion concurrency (integration)', () => {
  const run = `conc-${Date.now().toString(36)}`;
  let prisma: PrismaClient;
  let repository: IngestionRepository;
  let processor: ListingProcessor;
  let category: Category;
  let platforms: Platform[];

  const listing = (externalId: string, title: string, price: number | null, extra: Partial<RetailerListing> = {}): RetailerListing => ({
    externalId: `${run}-${externalId}`,
    externalUrl: `https://example.test/${externalId}`,
    title,
    priceUsd: price,
    currency: 'EGP',
    brand: null,
    model: null,
    imageUrl: null,
    inStock: true,
    rating: null,
    reviewCount: null,
    identifiers: { gtin: null, upc: null, ean: null, mpn: null },
    raw: {},
    ...extra,
  });

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repository = new IngestionRepository(prisma as never);
    processor = new ListingProcessor(
      repository,
      new FxRatesService({ get: (key: string, fallback?: unknown) => (key === 'pricing.fxRatesEnabled' ? false : fallback) } as ConfigService),
      { judgeSameProduct: async () => null } as never,
      new NormalizerService(),
      new FuzzyMatcherService(),
    );
    category = await prisma.category.create({
      data: { slug: `${run}-phones`, name: `Phones ${run}`, level: 1, searchTerms: [] },
    });
    platforms = await Promise.all(
      ['a', 'b', 'c'].map((suffix) =>
        prisma.platform.create({
          data: { slug: `${run}-${suffix}`, name: `Store ${suffix}`, baseUrl: 'https://example.test', connectorType: 'HTTP_API' },
        }),
      ),
    );
  });

  afterAll(async () => {
    const products = await prisma.canonicalProduct.findMany({ where: { categoryId: category.id }, select: { id: true } });
    const ids = products.map((product) => product.id);
    await prisma.matchDecision.deleteMany({ where: { sourceListing: { platformId: { in: platforms.map((p) => p.id) } } } });
    await prisma.priceHistory.deleteMany({ where: { canonicalProductId: { in: ids } } });
    await prisma.sourceListing.deleteMany({ where: { platformId: { in: platforms.map((p) => p.id) } } });
    await prisma.canonicalProduct.deleteMany({ where: { id: { in: ids } } });
    await prisma.platform.deleteMany({ where: { id: { in: platforms.map((p) => p.id) } } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.$disconnect();
  });

  it('two jobs seeing the same new product at once create it once', async () => {
    const title = 'Zentrofon Z900 5G 12GB RAM 256GB Black';
    const results = await Promise.all(
      platforms.map((platform, i) => processor.process(platform, category, listing(`new-${i}`, title, 20000 + i), platform.slug)),
    );
    const productIds = new Set(results.map((result) => result?.canonicalProductId));
    expect(productIds.size).toBe(1);
    expect(results.filter((result) => result?.createdCanonicalProduct)).toHaveLength(1);
  });

  it('the same listing processed twice at once writes one price point', async () => {
    const same = listing('dup', 'Zentrofon Z901 8GB RAM 128GB Blue', 15000);
    await Promise.all([
      processor.process(platforms[0], category, same, platforms[0].slug),
      processor.process(platforms[0], category, same, platforms[0].slug),
      processor.process(platforms[0], category, same, platforms[0].slug),
    ]);
    const stored = await prisma.sourceListing.findFirstOrThrow({ where: { externalId: same.externalId } });
    expect(await prisma.priceHistory.count({ where: { sourceListingId: stored.id } })).toBe(1);
  });

  it('appends a point on a stock change even when the price is unchanged, and not otherwise', async () => {
    const product = await prisma.canonicalProduct.findFirstOrThrow({ where: { categoryId: category.id } });
    const stored = await prisma.sourceListing.findFirstOrThrow({ where: { externalId: `${run}-dup` } });
    const entry = { sourceListingId: stored.id, canonicalProductId: product.id, priceUsd: '15000.00', currency: 'EGP', originalPrice: null };
    expect(await repository.appendPriceHistoryIfChanged({ ...entry, inStock: true })).toBe(false);
    expect(await repository.appendPriceHistoryIfChanged({ ...entry, inStock: false })).toBe(true);
    const concurrent = await Promise.all([1, 2, 3].map(() => repository.appendPriceHistoryIfChanged({ ...entry, priceUsd: '14000.00', inStock: false })));
    expect(concurrent.filter(Boolean)).toHaveLength(1);
  });

  it('a sold-out card with no price marks the stored listing out of stock (L-11)', async () => {
    await processor.recordUnpriced(platforms[1], listing('new-1', 'Zentrofon Z900 5G 12GB RAM 256GB Black', null, { inStock: false }));
    const stored = await prisma.sourceListing.findFirstOrThrow({ where: { externalId: `${run}-new-1` } });
    expect(stored.inStock).toBe(false);
    // A priceless card with no stock signal changes nothing.
    await processor.recordUnpriced(platforms[2], listing('new-2', 'Zentrofon Z900 5G 12GB RAM 256GB Black', null, { inStock: null }));
    expect((await prisma.sourceListing.findFirstOrThrow({ where: { externalId: `${run}-new-2` } })).inStock).toBe(true);
  });

  it('refuses a listing priced in a currency with no known rate (L-18)', async () => {
    const result = await processor.process(platforms[0], category, listing('xyz', 'Zentrofon Z902 8GB 256GB', 5000, { currency: 'XYZ' }), platforms[0].slug);
    expect(result).toBeNull();
    expect(await prisma.sourceListing.count({ where: { externalId: `${run}-xyz` } })).toBe(0);
  });

  it('the candidate pool is deterministic and includes the whole model family (L-03)', async () => {
    const near = { normalizedTitle: 'zentrofon z900 5g 12gb ram 256gb black', model: null };
    const first = await repository.candidates.findInCategory(category.id, near);
    const second = await repository.candidates.findInCategory(category.id, near);
    expect(first.map((p) => p.id)).toEqual(second.map((p) => p.id));
    expect(first.map((p) => p.id)).toEqual([...first.map((p) => p.id)].sort());
  });
});
