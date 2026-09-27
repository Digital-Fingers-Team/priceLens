import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../src/database/prisma.service';
import type { ProductsService } from '../../src/products/products.service';
import { SearchService } from '../../src/search/search.service';
import type { SearchQueryDto } from '../../src/search/dto/search.dto';
import type { IngestionQueue } from '../../src/workers/ingestion-queue.service';

/**
 * Browse pages (no query text) are cached for a minute (audit 08, P-08);
 * searches with text never are, because they queue a live scrape whose
 * results the page refetches. A cache failure is never an error.
 */
describe('SearchService browse cache', () => {
  function setup(cacheImpl?: { get: jest.Mock; set: jest.Mock }) {
    const store = new Map<string, unknown>();
    const cache = cacheImpl ?? {
      get: jest.fn(async (key: string) => store.get(key)),
      set: jest.fn(async (key: string, value: unknown) => void store.set(key, value)),
    };
    const prisma = { $queryRaw: jest.fn(async () => [{ id: 'p1', total: 1n }]) };
    const products = { searchHits: jest.fn(async (ids: string[]) => ids.map((id) => ({ id }))) };
    const queue = { enqueueQueryIngestion: jest.fn(async () => undefined) };
    const config = { get: (_key: string, fallback: unknown) => fallback };
    const service = new SearchService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      queue as unknown as IngestionQueue,
      products as unknown as ProductsService,
      cache as never,
    );
    return { service, prisma, products, cache, queue };
  }

  const query = (q: Partial<SearchQueryDto>) => q as SearchQueryDto;

  it('serves the same browse page from the cache the second time', async () => {
    const { service, prisma, products } = setup();
    const first = await service.search(query({ page: 1, limit: 20 }));
    const second = await service.search(query({ page: 1, limit: 20 }));

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(products.searchHits).toHaveBeenCalledTimes(1);
    expect(second.hits).toEqual(first.hits);
    expect(second.total).toBe(1);
    expect(second.liveFetchTriggered).toBe(false);
  });

  it('keys the cache on the filters and the page', async () => {
    const { service, prisma } = setup();
    await service.search(query({ page: 1 }));
    await service.search(query({ page: 2 }));
    await service.search(query({ page: 1, brand: 'Samsung' }));
    await service.search(query({ page: 1, sortBy: 'minPriceUsd', sortDir: 'asc' }));

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
  });

  it('never caches a search with query text', async () => {
    const { service, prisma, cache } = setup();
    await service.search(query({ q: 'galaxy' }));
    await service.search(query({ q: 'galaxy' }));

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('falls back to the database when the cache fails', async () => {
    const broken = {
      get: jest.fn(async () => {
        throw new Error('redis down');
      }),
      set: jest.fn(async () => {
        throw new Error('redis down');
      }),
    };
    const { service, prisma } = setup(broken);
    const result = await service.search(query({ page: 1 }));

    expect(result.total).toBe(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
