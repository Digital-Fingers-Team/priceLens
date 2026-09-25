import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';
import { LiveIngestionService } from '../../src/scraping/live-ingestion.service';
import { StoreCoverageService } from '../../src/scraping/store-coverage.service';
import { AmazonConnector } from '../../src/scraping/connectors/amazon.connector';
import { NoonConnector } from '../../src/scraping/connectors/noon.connector';
import { JumiaConnector } from '../../src/scraping/connectors/jumia.connector';
import { TwoBConnector } from '../../src/scraping/connectors/twob.connector';
import type { RetailerConnector } from '../../src/scraping/interfaces/retailer-connector.interface';
import type { RetailerListing } from '../../src/scraping/interfaces/retailer-listing.interface';
import type { IngestionReport } from '../../src/scraping/live-ingestion.service';
import { upsertCategories } from '../../seed/generators/generateProducts';
import { generateStores } from '../../seed/generators/generateStores';

/**
 * Characterization suite for the ingestion + matching pipeline.
 *
 * It pins down WHAT the pipeline decides today -- which product every scraped
 * listing lands on, which listings are rejected, what confidence and history
 * each gets -- for a fixed catalogue of listings chosen to reach every branch:
 * identifier match and conflict, exact-title match, every conflict guard, the
 * model-agreement fast path, the LLM-unavailable fuzzy fallback, the junk
 * filter, the category price floor and accessory rule, the market-outlier
 * check, a re-run that changes prices, cross-store backfill, on-demand store
 * expansion and the coverage sweep.
 *
 * Left out on purpose: titles whose RAM the normalizer cannot read
 * ("256GB/8GB", F-17). Such a listing is compatible with every RAM variant
 * of its model, they all tie at the model-agreement score, and the winner is
 * whichever the candidate query returns first -- which Postgres does not fix.
 * Phase 02 makes that case deterministic; until then it would make this
 * suite flaky rather than informative.
 *
 * The snapshot was recorded against the code BEFORE the phase 01 refactor. A
 * refactor must leave it byte-for-byte unchanged. A deliberate matching change
 * (phase 02) updates it on purpose, and the diff is the review.
 *
 * Store connectors are the only fakes. Everything else -- normalizer, guards,
 * FX (offline fallback table), Postgres -- is real.
 */

type Fixture = [externalId: string, title: string, price: number | null, extra?: Partial<RetailerListing>];

function listing([externalId, title, price, extra]: Fixture): RetailerListing {
  return {
    externalId,
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
  };
}

const gtin = (value: string) => ({ identifiers: { gtin: value, upc: null, ean: null, mpn: null } });

/** Per store: listings returned for each query the scenario runs. */
const PASSES: Record<string, Record<string, Fixture[]>> = {
  smartphone: {
    amazon: [
      ['a1', 'Samsung Galaxy A57 5G Dual SIM 256GB 8GB RAM Awesome Navy', 18999, { brand: 'Samsung' }],
      ['a2', 'Samsung Galaxy A57 5G Dual SIM 256GB 12GB RAM Awesome Gray', 21999, { brand: 'Samsung' }],
      ['a3', 'Sponsored Samsung Galaxy S26 Ultra 512GB', 2999],
      ['a4', 'Apple iPhone 16 Pro 256GB Desert Titanium', 64999, { brand: 'Apple', ...gtin('0195949000001') }],
      ['a5', 'Silicone Case for Samsung Galaxy A57 - Black', 350],
      ['a6', 'Xiaomi Redmi Note 14 Pro 8GB RAM 256GB Black', 14999],
      ['a7', 'Nokia 105 Feature Phone Dual SIM', 510],
      ['a8', 'OPPO A6 - 8GB RAM - 256GB - Sapphire Blue', 11999],
      ['a1', 'Samsung Galaxy A57 5G Dual SIM 256GB 8GB RAM Awesome Navy (repeat)', 17999],
      ['a11', 'Samsung Galaxy A36 5G 128GB', null],
      ['a12', 'Samsung Galaxy A26 5G 128GB', 0],
    ],
    jumia: [
      ['j1', 'Samsung Galaxy A57 5G - 8GB RAM - 256GB - Awesome Navy', 18299],
      ['j3', 'Apple iPhone 16 Pro (256 GB) - Desert Titanium', 63999, { brand: 'Apple', ...gtin('0195949000001') }],
      ['j4', 'Apple iPhone 16 Pro 256GB Black Titanium', 64500, { brand: 'Apple', ...gtin('0195949000099') }],
      ['j5', 'Xiaomi Redmi Note 14 Pro 8GB RAM 256GB Black Refurbished', 9999],
      ['j6', 'OPPO A6 Smartphone, 256 GB, Sapphire Blue, Dual SIM, 8 GB RAM', 12199],
      ['j7', 'Honor X9c 12GB RAM 256GB Titanium Black', 16999],
      ['j8', 'Samsung Galaxy A57 5G 128GB 8GB RAM Navy', 16999],
      ['j9', 'Tempered Glass Screen Protector for iPhone 16 Pro', 250],
    ],
    noon: [
      ['n1', 'Samsung Galaxy A57 5G Dual SIM 256GB 8GB RAM Awesome Navy', 18799],
      ['n2', 'Apple iPhone 16 Pro 256GB Desert Titanium', 99999],
      ['n3', 'Honor X9c 12GB RAM 256GB Titanium Black', 17499],
      ['n4', 'Xiaomi Redmi Note 14 Pro 5G 8GB 256GB Midnight Black', 15299],
      ['n5', 'Samsung Galaxy A57 bulk order 50 units', 9000],
      ['n6', 'iPhone 16 Pro 256GB Desert Titanium', 20000, { brand: 'Apple' }],
    ],
    '2b': [
      ['b1', 'Samsung Galaxy A57 5G, 8GB RAM, 256GB, Navy', 18650],
      ['b2', 'Apple iPhone 16 Pro Max 256GB Desert Titanium', 74999],
      ['b3', 'Honor X9c 5G Dual SIM 12GB 256GB Black', 16799],
      ['b4', 'Samsung Galaxy A57 Charger Cable USB-C', 150],
    ],
  },
  laptop: {
    amazon: [
      ['a20', 'Apple MacBook Air 13-inch M4 16GB 512GB Midnight', 64999],
      ['a21', 'Lenovo LOQ 15 Gaming Laptop RTX 5050 16GB 512GB', 54999],
      ['a22', 'HP Victus 15 Laptop Intel Core i5 16GB 512GB RTX 4050', 44999],
    ],
    jumia: [
      ['j20', 'Apple MacBook Air 13-inch M5 16GB 512GB Midnight', 69999],
      ['j21', 'Lenovo LOQ 15IAX9 Gaming Laptop, RTX 5050, 16GB RAM, 512GB SSD', 55999],
      ['j22', 'Apple MacBook Air 15-inch M4 16GB 512GB Midnight', 74999],
    ],
    noon: [['n20', 'MSI GeForce RTX 5050 Ventus 2X 8GB OC Graphics Card', 15999]],
    '2b': [['b20', 'HP Victus 15-fa1000 Laptop Core i5 16GB 512GB RTX 4050', 45999]],
  },
  'graphics card': {
    amazon: [
      ['a30', 'ASUS Dual GeForce RTX 5060 Ti 16GB OC', 24999],
      ['a31', 'ASUS Dual GeForce RTX 5060 8GB OC', 17999],
    ],
    jumia: [['j30', 'ASUS Dual RTX 5060 Ti 16GB GDDR7 OC Edition', 25499]],
    noon: [['n30', 'Gigabyte RTX 5060 Ti 16GB Gaming OC', 26999]],
    '2b': [['b30', 'ASUS Dual GeForce RTX 5060 Ti 16GB OC', 24500]],
  },
};

/** The second "smartphone" run: new prices, a now-sane outlier, a now-bad price. */
const REPEAT_SMARTPHONE: Record<string, Fixture[]> = {
  amazon: [
    ['a1', 'Samsung Galaxy A57 5G Dual SIM 256GB 8GB RAM Awesome Navy', 18499, { brand: 'Samsung' }],
    ['a4', 'Apple iPhone 16 Pro 256GB Desert Titanium', 64999, { brand: 'Apple', ...gtin('0195949000001') }],
    ['a3', 'Sponsored Samsung Galaxy S26 Ultra 512GB', 2999],
  ],
  jumia: [['j1', 'Samsung Galaxy A57 5G - 8GB RAM - 256GB - Awesome Navy', 2000]],
  noon: [['n2', 'Apple iPhone 16 Pro 256GB Desert Titanium', 64999]],
  '2b': [],
};

/** What each store "carries" when searched with a query outside the passes (backfill, expansion). */
const EXTRA_CATALOG: Record<string, Fixture[]> = {
  amazon: [['a40', 'Honor X9c 5G 12GB RAM 256GB Titanium Black', 17199]],
  jumia: [['j40', 'Nokia 105 Dual SIM Feature Phone Black', 530]],
  noon: [['n40', 'Nokia 105 Feature Phone Dual SIM Blue', 520]],
  '2b': [['b40', 'Xiaomi Redmi Note 14 Pro 8GB 256GB Black', 15099]],
};

const STORES = ['amazon', 'jumia', 'noon', '2b'] as const;

function makeConnector(slug: string, current: { query: string; overrides: Record<string, Fixture[]> | null }): RetailerConnector {
  const catalog = [
    ...Object.values(PASSES).flatMap((pass) => pass[slug] ?? []),
    ...(EXTRA_CATALOG[slug] ?? []),
  ];
  return {
    slug,
    isEnabled: true,
    searchListings: async (query: string, limit: number) => {
      if (current.overrides && query === current.query) {
        return (current.overrides[slug] ?? []).map(listing);
      }
      const pass = PASSES[query];
      if (pass) {
        return (pass[slug] ?? []).slice(0, limit).map(listing);
      }
      // Anything else is a backfill / expansion query: every catalogue title
      // containing all of the query's words, first match per external id.
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      const seen = new Set<string>();
      return catalog
        .filter(([id, title, price]) => {
          if (seen.has(id) || price == null) return false;
          const hit = words.every((word) => title.toLowerCase().includes(word));
          if (hit) seen.add(id);
          return hit;
        })
        .slice(0, limit)
        .map(listing);
    },
  };
}

function describeReport(report: IngestionReport) {
  return {
    // jobId is a fresh uuid every run.
    platforms: report.platforms.map((summary) =>
      Object.fromEntries(Object.entries(summary).filter(([key]) => key !== "jobId")),
    ),
    skippedPlatforms: report.skippedPlatforms,
  };
}

const ENV_OVERRIDES: Record<string, string> = {
  CROSS_STORE_BACKFILL_ENABLED: 'true',
  STORE_COVERAGE_SWEEP_ENABLED: 'true',
  MIN_STORES_PER_PRODUCT: '3',
};

describe('Matching pipeline characterization (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const savedEnv: Record<string, string | undefined> = {};
  const current: { query: string; overrides: Record<string, Fixture[]> | null } = { query: '', overrides: null };
  const reports: Record<string, unknown> = {};
  let state: Awaited<ReturnType<typeof captureState>>;

  beforeAll(async () => {
    for (const [key, value] of Object.entries(ENV_OVERRIDES)) {
      savedEnv[key] = process.env[key];
      process.env[key] = value;
    }

    let builder = Test.createTestingModule({ imports: [AppModule] });
    const classes = { amazon: AmazonConnector, jumia: JumiaConnector, noon: NoonConnector, '2b': TwoBConnector };
    for (const slug of STORES) {
      builder = builder.overrideProvider(classes[slug]).useValue(makeConnector(slug, current));
    }
    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe(
      'TRUNCATE canonical_products, source_listings, price_history, match_decisions, review_queue, scraping_jobs CASCADE',
    );
    await upsertCategories(prisma as unknown as PrismaClient);
    await generateStores(prisma as unknown as PrismaClient);

    // Enough priced smartphones from an unrelated store to arm the category
    // price floor and the accessory rule (both need >= 50 listings).
    const smartphones = await prisma.category.findUniqueOrThrow({ where: { slug: 'smartphones' } });
    const elaraby = await prisma.platform.findUniqueOrThrow({ where: { slug: 'elaraby' } });
    for (let n = 1; n <= 60; n += 1) {
      const product = await prisma.canonicalProduct.create({
        data: {
          categoryId: smartphones.id,
          slug: `zentrofon-z${n}`,
          title: `Zentrofon Z${n} 64GB`,
          normalizedTitle: `zentrofon z${n} 64gb`,
          brand: 'Zentrofon',
          model: `Z${n}`,
        },
      });
      await prisma.sourceListing.create({
        data: {
          platformId: elaraby.id,
          canonicalProductId: product.id,
          externalId: `filler-${n}`,
          externalUrl: `https://example.test/filler-${n}`,
          rawTitle: product.title,
          rawCurrency: 'EGP',
          priceUsd: (10_000 + n * 100).toFixed(2),
          matchStatus: 'ACCEPTED',
        },
      });
    }

    const ingestion = app.get(LiveIngestionService);
    const run = async (query: string, overrides: Record<string, Fixture[]> | null = null) => {
      current.query = query;
      current.overrides = overrides;
      return describeReport(
        await ingestion.runQueryIngestion(query, { platformSlugs: [...STORES], limitPerQuery: 20 }),
      );
    };

    reports.smartphone = await run('smartphone');
    reports.laptop = await run('laptop');
    reports.graphicsCard = await run('graphics card');
    reports.smartphoneRepeat = await run('smartphone', REPEAT_SMARTPHONE);
    current.overrides = null;

    const nokia = await prisma.sourceListing.findFirstOrThrow({ where: { externalId: 'a7' } });
    const coverage = app.get(StoreCoverageService);
    await coverage.expandProductStores(nokia.canonicalProductId!, 3, 5);

    // The catalogue as the pipeline left it. Captured before the coverage
    // sweep: the sweep visits products in an order the database does not fix
    // (ties on store count), so only its totals are pinned down.
    state = await captureState(prisma);

    const sweep = await coverage.runStoreCoverageSweep(100);
    const stamped = await prisma.canonicalProduct.count({ where: { lastCoverageAttemptAt: { not: null } } });
    reports.coverageSweep = { ...sweep, stamped };
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await app?.close();
  });

  it('ingestion reports', () => {
    expect(reports).toMatchSnapshot();
  });

  it('where every listing landed', () => {
    expect(state.listings).toMatchSnapshot();
  });

  it('listings never stored', () => {
    expect(state.neverStored).toMatchSnapshot();
  });

  it('canonical products', () => {
    expect(state.products).toMatchSnapshot();
  });

  it('match decisions', () => {
    expect(state.decisions).toMatchSnapshot();
  });
});

async function captureState(prisma: PrismaService) {
  const rows = await prisma.sourceListing.findMany({
    where: { NOT: { externalId: { startsWith: 'filler-' } } },
    include: { platform: true, canonicalProduct: true, _count: { select: { priceHistory: true } } },
  });
  const listings = rows
    .map(
      (row) =>
        `${row.platform.slug}/${row.externalId} -> ${row.canonicalProduct?.slug ?? '(none)'} ` +
        `${row.matchStatus} conf=${row.matchConfidence} price=${row.priceUsd} history=${row._count.priceHistory}`,
    )
    .sort();

  const offered = new Set<string>();
  for (const pass of [...Object.values(PASSES), REPEAT_SMARTPHONE, EXTRA_CATALOG]) {
    for (const [slug, fixtures] of Object.entries(pass)) {
      for (const [id] of fixtures) offered.add(`${slug}/${id}`);
    }
  }
  const storedKeys = new Set(rows.map((row) => `${row.platform.slug}/${row.externalId}`));
  const neverStored = [...offered].filter((key) => !storedKeys.has(key)).sort();

  const productRows = await prisma.canonicalProduct.findMany({
    where: { NOT: { brand: 'Zentrofon' } },
    include: { category: true, _count: { select: { sourceListings: true } } },
  });
  const products = productRows
    .map(
      (p) =>
        `${p.category.slug} | ${p.slug} | brand=${p.brand} model=${p.model} tier=${p.tier} ` +
        `listings=${p._count.sourceListings} covered=${p.lastCoverageAttemptAt ? 'yes' : 'no'}`,
    )
    .sort();

  const decisionRows = await prisma.matchDecision.findMany({
    include: { sourceListing: { include: { platform: true } } },
  });
  const decisions = decisionRows
    .map(
      (d) =>
        `${d.sourceListing.platform.slug}/${d.sourceListing.externalId} ${d.status} ${d.confidence} ` +
        `${d.engineVersion} ${JSON.stringify(d.scores)} ${d.reasoning}`,
    )
    .sort();

  return { listings, neverStored, products, decisions };
}
