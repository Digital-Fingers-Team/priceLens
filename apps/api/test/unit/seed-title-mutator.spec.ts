import { MatchStatus, ProductTier } from '@prisma/client';
import { storeDefinitions } from '../../seed/factories/storeFactory';
import type { CanonicalProductSeed } from '../../seed/types';
import { SeededRandom } from '../../seed/utils/random';
import { mutateTitle, normalizeTitle } from '../../seed/utils/titleMutator';

describe('titleMutator', () => {
  const product: CanonicalProductSeed = {
    id: 'product-id',
    categorySlug: 'smartphones',
    categoryId: 'category-id',
    slug: 'apple-iphone-15-pro-max-256gb-natural-titanium',
    title: 'Apple iPhone 15 Pro Max 256GB Natural Titanium',
    normalizedTitle: 'apple iphone 15 pro max 256gb natural titanium',
    brand: 'Apple',
    model: 'iPhone 15 Pro Max',
    sku: 'APL-IP15PM-256',
    gtin: '8800000000001',
    mpn: 'APPLE-IP15PM-256',
    attributes: { storage: '256GB', color: 'Natural Titanium', variant: 'Pro Max' },
    basePrice: 1199,
    tier: ProductTier.ULTRA_PREMIUM,
    searchBoost: 1.4,
    imageUrl: 'https://example.test/full.png',
    thumbnailUrl: 'https://example.test/thumb.png',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  it('creates marketplace-specific title variations', () => {
    const amazon = storeDefinitions.find((store) => store.slug === 'amazon');
    const noon = storeDefinitions.find((store) => store.slug === 'noon');
    expect(amazon).toBeDefined();
    expect(noon).toBeDefined();

    const amazonTitle = mutateTitle(product, amazon!, new SeededRandom('amazon-title'));
    const noonTitle = mutateTitle(product, noon!, new SeededRandom('noon-title'));

    expect(amazonTitle).not.toEqual(noonTitle);
    expect(normalizeTitle(amazonTitle)).toContain('iphone');
    expect(normalizeTitle(noonTitle)).toContain('256');
  });

  it('normalizes punctuation and casing', () => {
    expect(normalizeTitle('iPhone 15 Pro | 256 GB - Natural Titanium')).toBe('iphone 15 pro 256 gb - natural titanium');
  });

  it('keeps valid match statuses available for generated listings', () => {
    expect(MatchStatus.ACCEPTED).toBe('ACCEPTED');
    expect(MatchStatus.PENDING).toBe('PENDING');
  });
});
