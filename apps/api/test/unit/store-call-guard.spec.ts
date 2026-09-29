import type { ConfigService } from '@nestjs/config';
import type { Category, Platform } from '@prisma/client';
import { StoreCallGuard, StoreUnavailableError } from '../../src/scraping/ingestion/store-call-guard';
import { LiveIngestionService } from '../../src/scraping/live-ingestion.service';
import { ConnectorRegistry } from '../../src/scraping/connectors/connector.registry';
import type { RetailerConnector } from '../../src/scraping/interfaces/retailer-connector.interface';
import type { RetailerListing } from '../../src/scraping/interfaces/retailer-listing.interface';
import type { IngestionRepository } from '../../src/scraping/ingestion/ingestion.repository';
import type { ListingProcessor } from '../../src/scraping/ingestion/listing-processor.service';
import type { NormalizerService } from '../../src/matching/normalizer.service';

function config(values: Record<string, unknown> = {}): ConfigService {
  const defaults: Record<string, unknown> = {
    'retailers.connectorFailureThreshold': 2,
    'retailers.connectorCooldownMinutes': 30,
    'retailers.storeMinRequestIntervalMs': 0,
    'retailers.storeRetryDelayMs': 0,
    'retailers.crossStoreBackfillEnabled': false,
    ...values,
  };
  return { get: (key: string, fallback: unknown) => (key in defaults ? defaults[key] : fallback) } as ConfigService;
}

function listing(externalId: string): RetailerListing {
  return {
    externalId,
    externalUrl: `https://store.test/${externalId}`,
    title: `Phone ${externalId}`,
    priceUsd: 1000,
    currency: 'EGP',
    brand: null,
    model: null,
    imageUrl: null,
    inStock: true,
    rating: null,
    reviewCount: null,
    identifiers: { gtin: null, upc: null, ean: null, mpn: null },
    raw: {},
  };
}

function connector(slug: string, search: RetailerConnector['searchListings']): RetailerConnector {
  return { slug, isEnabled: true, searchListings: jest.fn(search) };
}

describe('StoreCallGuard (B-07)', () => {
  it('retries a failed search once, then succeeds', async () => {
    const guard = new StoreCallGuard(config());
    let calls = 0;
    const store = connector('noon', async () => {
      calls++;
      if (calls === 1) throw new Error('navigation timeout');
      return [listing('a')];
    });

    await expect(guard.search(store, 'iphone', 5)).resolves.toHaveLength(1);
    expect(calls).toBe(2);
  });

  it('opens the circuit after repeated failures, for every caller', async () => {
    const guard = new StoreCallGuard(config());
    const store = connector('noon', async () => {
      throw new Error('blocked');
    });

    await expect(guard.search(store, 'a', 5)).rejects.toThrow('blocked');
    await expect(guard.search(store, 'b', 5)).rejects.toThrow('blocked');
    expect(guard.isPaused('noon')).toBe(true);
    await expect(guard.search(store, 'c', 5)).rejects.toBeInstanceOf(StoreUnavailableError);
    expect(store.searchListings).toHaveBeenCalledTimes(4); // 2 calls x (try + retry), none after opening
  });

  it('counts an empty answer as a failure only for broad sweep queries', async () => {
    const guard = new StoreCallGuard(config());
    const store = connector('jumia', async () => []);

    await guard.search(store, 'what a user typed', 5);
    await guard.search(store, 'what a user typed', 5);
    expect(guard.isPaused('jumia')).toBe(false);

    await guard.search(store, 'smartphones', 5, { emptyIsFailure: true });
    await guard.search(store, 'smartphones', 5, { emptyIsFailure: true });
    expect(guard.isPaused('jumia')).toBe(true);
    expect(store.searchListings).toHaveBeenCalledTimes(4); // empty answers are not retried
  });

  it('spaces calls to the same store by the minimum interval', async () => {
    const guard = new StoreCallGuard(config({ 'retailers.storeMinRequestIntervalMs': 2000 }));
    const waits: number[] = [];
    guard.sleep = async (ms) => void waits.push(ms);
    const store = connector('noon', async () => [listing('a')]);

    await guard.search(store, 'a', 5);
    await guard.search(store, 'b', 5);

    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThan(1900);
  });
});

describe('LiveIngestionService sweep with a failing query (B-07)', () => {
  const platform = { id: 'p-noon', slug: 'noon', name: 'Noon' } as Platform;
  const categories = [
    { id: 'c1', slug: 'smartphones', name: 'Smartphones', searchTerms: ['phone'], rolloutWave: 0, lastSweptAt: null },
    { id: 'c2', slug: 'laptops', name: 'Laptops', searchTerms: ['laptop'], rolloutWave: 0, lastSweptAt: null },
    { id: 'c3', slug: 'refrigerators', name: 'Refrigerators', searchTerms: ['fridge'], rolloutWave: 1, lastSweptAt: null },
  ] as unknown as Category[];

  function setup(search: RetailerConnector['searchListings'], process?: jest.Mock, settings: Record<string, unknown> = {}) {
    const repository = {
      findActivePlatforms: jest.fn(async () => [platform]),
      findLeafCategories: jest.fn(async () => categories),
      markCategoriesSwept: jest.fn(async () => undefined),
      dominantLeafCategoryForQuery: jest.fn(async () => null),
      startJob: jest.fn(async () => 'job-1'),
      completeJob: jest.fn(async () => undefined),
      failJob: jest.fn(async () => undefined),
    } as unknown as IngestionRepository;
    const processor = {
      process:
        process ??
        jest.fn(async () => ({
          canonicalProductId: 'cp-1',
          priceHistoryCreated: true,
          createdCanonicalProduct: false,
          matchedExistingCanonicalProduct: true,
        })),
      recordUnpriced: jest.fn(async () => undefined),
      takeBelowFloor: jest.fn(() => ({ total: 0, byCategory: {} })),
    } as unknown as ListingProcessor;
    const store = connector('noon', search);
    const service = new LiveIngestionService(
      repository,
      processor,
      new ConnectorRegistry([store]),
      {} as NormalizerService,
      config(settings),
      new StoreCallGuard(config({ 'retailers.connectorFailureThreshold': 100 })),
    );
    return { service, repository, store };
  }

  it('skips the failed query and keeps sweeping the store', async () => {
    let n = 0;
    let fails = 0;
    const { service, repository } = setup(async (query) => {
      n++;
      // The first category query fails twice (try + retry).
      if (query === 'Smartphones' && ++fails <= 2) throw new Error('timeout');
      return [listing(`l${n}`)];
    });

    const report = await service.runLiveIngestion({ platformSlugs: ['noon'] });

    expect(report.skippedPlatforms).toEqual([]);
    const summary = report.platforms[0];
    expect(summary.queriesFailed).toBe(1);
    expect(summary.queriesRun).toBeGreaterThan(1);
    expect(summary.listingsUpserted).toBeGreaterThan(0);
    expect(repository.completeJob).toHaveBeenCalled();
    expect(repository.failJob).not.toHaveBeenCalled();
  });

  it('skips a listing that fails to process and keeps going', async () => {
    const process = jest
      .fn()
      .mockRejectedValueOnce(new Error('unique constraint'))
      .mockResolvedValue({ canonicalProductId: 'cp-1', priceHistoryCreated: false, createdCanonicalProduct: false, matchedExistingCanonicalProduct: true });
    let n = 0;
    const { service } = setup(async () => [listing(`l${++n}`)], process);

    const report = await service.runLiveIngestion({ platformSlugs: ['noon'] });

    expect(report.platforms[0].listingsFailed).toBe(1);
    expect(report.platforms[0].listingsUpserted).toBe(report.platforms[0].listingsDiscovered - 1);
  });

  it('sweeps only wave 0 while no wave is enabled, and marks nothing swept', async () => {
    const queries: string[] = [];
    const { service, repository } = setup(async (query) => {
      queries.push(query);
      return [];
    });

    await service.runLiveIngestion({ platformSlugs: ['noon'] });

    expect(queries.some((query) => /fridge|refrigerator/i.test(query))).toBe(false);
    expect(repository.markCategoriesSwept).toHaveBeenCalledWith([], expect.any(Date));
  });

  it('adds an enabled wave to the sweep and marks it swept, even when stores return nothing', async () => {
    const queries: string[] = [];
    const { service, repository } = setup(
      async (query) => {
        queries.push(query);
        return [];
      },
      undefined,
      { 'retailers.categorySweepMaxWave': 1 },
    );

    await service.runLiveIngestion({ platformSlugs: ['noon'] });

    expect(queries).toContain('Refrigerators');
    expect(repository.markCategoriesSwept).toHaveBeenCalledWith(['c3'], expect.any(Date));
  });

  it('keeps sweeping a healthy store that does not sell the first categories', async () => {
    // Prod, 2026-09-29: Elaraby (an appliance store) answered nothing for the
    // CPU and console queries the sweep starts with, and was paused before it
    // reached the categories it sells. A broad probe proves it is not blocked.
    const guard = new StoreCallGuard(config({ 'retailers.connectorFailureThreshold': 2 }));
    const repository = {
      findActivePlatforms: jest.fn(async () => [platform]),
      findLeafCategories: jest.fn(async () => categories),
      markCategoriesSwept: jest.fn(async () => undefined),
      startJob: jest.fn(async () => 'job-1'),
      completeJob: jest.fn(async () => undefined),
      failJob: jest.fn(async () => undefined),
    } as unknown as IngestionRepository;
    const processor = {
      process: jest.fn(async () => null),
      recordUnpriced: jest.fn(async () => undefined),
      takeBelowFloor: jest.fn(() => ({ total: 0, byCategory: {} })),
    } as unknown as ListingProcessor;
    const asked: string[] = [];
    let n = 0;
    const store = connector('noon', async (query) => {
      asked.push(query);
      return /samsung|fridge|refrigerator/i.test(query) ? [listing(`l${++n}`)] : [];
    });
    const service = new LiveIngestionService(
      repository,
      processor,
      new ConnectorRegistry([store]),
      {} as NormalizerService,
      config({ 'retailers.categorySweepMaxWave': 1 }),
      guard,
    );

    const report = await service.runLiveIngestion({ platformSlugs: ['noon'] });

    expect(guard.isPaused('noon')).toBe(false);
    expect(report.skippedPlatforms).toEqual([]);
    expect(asked).toContain('Refrigerators');
  });

  it('tries each probe word: a store that only answers product words ("tv") is healthy', async () => {
    // Prod, 2026-09-29 06:00: Elaraby answers "tv" and "refrigerator" but not
    // a bare brand like "samsung", so a single brand probe paused it again.
    const guard = new StoreCallGuard(config({ 'retailers.connectorFailureThreshold': 2 }));
    const { service } = setup(async (query) => (/^tv$|fridge|refrigerator/i.test(query) ? [listing(`l-${query}`)] : []), undefined, {
      'retailers.categorySweepMaxWave': 1,
      'retailers.storeProbeQuery': 'samsung,tv',
    });
    Object.assign(service, { storeCalls: guard });

    const report = await service.runLiveIngestion({ platformSlugs: ['noon'] });

    expect(guard.isPaused('noon')).toBe(false);
    expect(report.skippedPlatforms).toEqual([]);
  });

  it('still pauses a store whose probe comes back empty (a silently blocked store)', async () => {
    const guard = new StoreCallGuard(config({ 'retailers.connectorFailureThreshold': 2 }));
    const { service } = setup(async () => []);
    // setup() builds its own guard; use one with a low threshold instead.
    Object.assign(service, { storeCalls: guard });

    const report = await service.runLiveIngestion({ platformSlugs: ['noon'] });

    expect(guard.isPaused('noon')).toBe(true);
    expect(report.skippedPlatforms.map((s) => s.slug)).toEqual(['noon']);
  });

  it('does not advance the rotation when no store was swept', async () => {
    const { service, repository } = setup(async () => [], undefined, { 'retailers.categorySweepMaxWave': 1 });
    // No active store at all (every one inactive or skipped).
    (repository.findActivePlatforms as jest.Mock).mockResolvedValue([]);

    await service.runLiveIngestion({ platformSlugs: ['noon'] });

    expect(repository.markCategoriesSwept).not.toHaveBeenCalled();
  });

  it('does not pause a store that simply has nothing for a new-wave category', async () => {
    // Prod, 2026-09-29 00:20: AliExpress returned nothing for five appliance
    // queries in a row and its circuit opened, pausing it for users too.
    const guardConfig = config({ 'retailers.connectorFailureThreshold': 2 });
    const guard = new StoreCallGuard(guardConfig);
    const repository = {
      findActivePlatforms: jest.fn(async () => [platform]),
      findLeafCategories: jest.fn(async () => categories),
      markCategoriesSwept: jest.fn(async () => undefined),
      startJob: jest.fn(async () => 'job-1'),
      completeJob: jest.fn(async () => undefined),
      failJob: jest.fn(async () => undefined),
    } as unknown as IngestionRepository;
    const processor = {
      process: jest.fn(async () => null),
      recordUnpriced: jest.fn(async () => undefined),
      takeBelowFloor: jest.fn(() => ({ total: 0, byCategory: {} })),
    } as unknown as ListingProcessor;
    let n = 0;
    const store = connector('noon', async (query) => (/fridge|refrigerator/i.test(query) ? [] : [listing(`l${++n}`)]));
    const service = new LiveIngestionService(
      repository,
      processor,
      new ConnectorRegistry([store]),
      {} as NormalizerService,
      config({ 'retailers.categorySweepMaxWave': 1 }),
      guard,
    );

    const report = await service.runLiveIngestion({ platformSlugs: ['noon'] });

    expect(guard.isPaused('noon')).toBe(false);
    expect(report.skippedPlatforms).toEqual([]);
    expect(repository.failJob).not.toHaveBeenCalled();
  });

  it('does not scrape a search into a category whose wave is not enabled yet', async () => {
    const queries: string[] = [];
    const { service } = setup(async (query) => {
      queries.push(query);
      return [];
    });

    const report = await service.runQueryIngestion('lg fridge 400 liters', { platformSlugs: ['noon'] });

    expect(queries).toEqual([]);
    expect(report.skippedPlatforms).toEqual([{ slug: 'noon', reason: 'no_matching_category' }]);
  });

  it('scrapes a search into an enabled wave', async () => {
    const queries: string[] = [];
    const { service } = setup(
      async (query) => {
        queries.push(query);
        return [];
      },
      undefined,
      { 'retailers.categorySweepMaxWave': 1 },
    );

    await service.runQueryIngestion('lg fridge 400 liters', { platformSlugs: ['noon'] });

    expect(queries).toEqual(['lg fridge 400 liters']);
  });
});

describe('StoreCallGuard: a store that just lacks a product stays available', () => {
  it('neutral empty answers neither open the circuit nor reset a failure streak', async () => {
    const guard = new StoreCallGuard(config());
    let fail = true;
    const store = connector('2b', async () => {
      if (fail) throw new Error('timeout');
      return [];
    });

    await expect(guard.search(store, 'a', 5)).rejects.toThrow('timeout'); // failure 1 of 2
    fail = false;
    for (let i = 0; i < 5; i++) await guard.search(store, 'samsung galaxy a57 256gb', 5); // not carried
    expect(guard.isPaused('2b')).toBe(false);

    fail = true;
    await expect(guard.search(store, 'b', 5)).rejects.toThrow('timeout'); // failure 2 of 2
    expect(guard.isPaused('2b')).toBe(true);
  });
});
