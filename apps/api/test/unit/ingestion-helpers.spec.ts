import type { Category } from '@prisma/client';
import { NormalizerService } from '../../src/matching/normalizer.service';
import { ConnectorRegistry } from '../../src/scraping/connectors/connector.registry';
import { ConnectorCircuitBreaker } from '../../src/scraping/ingestion/connector-circuit-breaker';
import { inferTier, toDbDecimal, toSlug } from '../../src/scraping/ingestion/listing-mapping';
import {
  buildProductQuery,
  buildQueriesForCategory,
  pickCategoryForQuery,
} from '../../src/scraping/ingestion/search-queries';
import type { RetailerConnector } from '../../src/scraping/interfaces/retailer-connector.interface';

function category(name: string, slug: string, searchTerms: string[]): Category {
  return { id: slug, name, slug, searchTerms, parentId: null, level: 1, createdAt: new Date(0) } as Category;
}

const phones = category('Smartphones', 'smartphones', ['phone', 'smartphone', 'mobile', 'cell phone']);
const laptops = category('Laptops', 'laptops', ['laptop', 'notebook']);
const gpus = category('Graphics Cards', 'graphics-cards', ['gpu', 'graphics card']);

describe('ingestion helpers', () => {
  describe('ConnectorRegistry', () => {
    const connector = (slug: string, isEnabled: boolean): RetailerConnector => ({
      slug,
      isEnabled,
      searchListings: async () => [],
    });
    const registry = new ConnectorRegistry([connector('amazon', true), connector('noon', false)]);

    it('keeps registration order and looks connectors up by slug', () => {
      expect(registry.slugs()).toEqual(['amazon', 'noon']);
      expect(registry.get('amazon')?.slug).toBe('amazon');
      expect(registry.get('jumia')).toBeUndefined();
      expect(registry.has('noon')).toBe(true);
    });

    it('reports a store enabled only when its connector exists and is on', () => {
      expect(registry.isEnabled('amazon')).toBe(true);
      expect(registry.isEnabled('noon')).toBe(false);
      expect(registry.isEnabled('jumia')).toBe(false);
    });
  });

  describe('ConnectorCircuitBreaker', () => {
    afterEach(() => jest.useRealTimers());

    it('opens after the threshold of consecutive failures and closes after the cooldown', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const breaker = new ConnectorCircuitBreaker(() => ({ threshold: 2, cooldownMinutes: 30 }));

      breaker.recordFailure('noon', 'empty');
      expect(breaker.isInCooldown('noon')).toBe(false);
      breaker.recordFailure('noon', 'empty');
      expect(breaker.isInCooldown('noon')).toBe(true);

      jest.setSystemTime(new Date('2026-01-01T00:30:00Z'));
      expect(breaker.isInCooldown('noon')).toBe(false);
      // The count was reset: one more failure does not reopen it.
      breaker.recordFailure('noon', 'empty');
      expect(breaker.isInCooldown('noon')).toBe(false);
    });

    it('a success resets the count', () => {
      const breaker = new ConnectorCircuitBreaker(() => ({ threshold: 2, cooldownMinutes: 30 }));
      breaker.recordFailure('amazon', 'x');
      breaker.recordSuccess('amazon');
      breaker.recordFailure('amazon', 'x');
      expect(breaker.isInCooldown('amazon')).toBe(false);
    });
  });

  describe('search queries', () => {
    it('builds up to three distinct sweep queries per category', () => {
      expect(buildQueriesForCategory(phones)).toEqual(['Smartphones', 'smartphones', 'phone']);
      expect(buildQueriesForCategory(gpus)).toEqual(['Graphics Cards', 'graphics cards', 'gpu']);
    });

    it('picks the category a free-text query belongs to, falling back to the first', () => {
      const all = [phones, laptops, gpus];
      expect(pickCategoryForQuery('iphone 15 128gb phone', all)).toBe(phones);
      expect(pickCategoryForQuery('Gaming Laptop', all)).toBe(laptops);
      expect(pickCategoryForQuery('graphics card', all)).toBe(gpus);
      expect(pickCategoryForQuery('air fryer', all)).toBe(phones);
      expect(pickCategoryForQuery('anything', [])).toBeNull();
    });

    it('builds a brand + model + storage product query, or none when too vague', () => {
      const normalizer = new NormalizerService();
      expect(buildProductQuery({ title: 'OPPO A6 - 8GB RAM - 256GB - Sapphire Blue', brand: null, model: null }, normalizer)).toBe(
        'OPPO a6 256GB',
      );
      expect(buildProductQuery({ title: 'Some Gadget', brand: null, model: null }, normalizer)).toBeNull();
    });
  });

  describe('listing mapping', () => {
    it('formats decimals and refuses non-finite values', () => {
      expect(toDbDecimal(18999)).toBe('18999.00');
      expect(toDbDecimal(null)).toBeNull();
      expect(toDbDecimal(Number.NaN)).toBeNull();
    });

    it('slugifies titles', () => {
      expect(toSlug('  Apple iPhone 16 Pro (256 GB) -- Desert ')).toBe('apple-iphone-16-pro-256-gb-desert');
    });

    it('tiers by raw price', () => {
      expect(inferTier(null)).toBe('MID_RANGE');
      expect(inferTier(299)).toBe('BUDGET');
      expect(inferTier(899)).toBe('MID_RANGE');
      expect(inferTier(1799)).toBe('PREMIUM');
      expect(inferTier(1800)).toBe('ULTRA_PREMIUM');
    });
  });
});
