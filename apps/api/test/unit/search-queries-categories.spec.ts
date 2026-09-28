import type { Category } from '@prisma/client';
import { categoryTree } from '../../seed/datasets/categoryTree';
import { buildQueriesForCategory, pickCategoryForQuery } from '../../src/scraping/ingestion/search-queries';

/** The real tree as the resolver sees it: leaves only, as the repository returns them. */
const leaves = categoryTree
  .filter((c) => c.level === 1)
  .map((c) => ({ id: c.slug, slug: c.slug, name: c.name, searchTerms: c.searchTerms, level: 1 }) as unknown as Category);

const pick = (query: string) => pickCategoryForQuery(query, leaves)?.slug ?? null;

describe('pickCategoryForQuery against the curated tree', () => {
  it.each([
    ['samsung side by side refrigerator', 'refrigerators'],
    ['LG washing machine 9kg', 'washing-machines'],
    ['sharp split air conditioner 1.5 hp inverter', 'air-conditioners'],
    ['delonghi espresso machine', 'coffee-machines'],
    ['xiaomi electric scooter 4 pro', 'electric-scooters'],
    ['canon mirrorless camera', 'digital-cameras'],
    ['treadmill 2hp', 'treadmills'],
  ])('resolves "%s" to %s', (query, slug) => {
    expect(pick(query)).toBe(slug);
  });

  it('prefers the longest matching term: "baby monitor" is baby gear, not a computer monitor', () => {
    expect(pick('philips baby monitor')).toBe('baby-monitors');
    expect(pick('dell 27 inch monitor')).toBe('monitors');
  });

  it('matches plurals', () => {
    expect(pick('refrigerators')).toBe('refrigerators');
    expect(pick('gaming laptops')).toBe('laptops');
  });

  it('matches whole words, not substrings', () => {
    // "phone" is inside "headphones", "ram" is inside "camera".
    expect(pick('sony headphones')).toBe('headphones');
    expect(pick('camera')).toBe('digital-cameras');
  });

  it('still routes model-family searches to the original categories', () => {
    expect(pick('iphone 16 pro max')).toBe('smartphones');
    expect(pick('galaxy s24 ultra')).toBe('smartphones');
    expect(pick('macbook air m3')).toBe('laptops');
    expect(pick('rtx 4070 super')).toBe('graphics-cards');
    expect(pick('ps5 slim')).toBe('gaming-consoles');
  });

  it('resolves Arabic queries', () => {
    expect(pick('ثلاجة شارب')).toBe('refrigerators');
    expect(pick('غسالة اطباق بيكو')).toBe('dishwashers');
    expect(pick('تكييف كاريير')).toBe('air-conditioners');
  });

  it('returns null when nothing matches', () => {
    expect(pick('xyzzy')).toBeNull();
    expect(pickCategoryForQuery('anything', [])).toBeNull();
  });
});

describe('buildQueriesForCategory', () => {
  const refrigerators = leaves.find((c) => c.slug === 'refrigerators')!;

  it('dedupes case- and plural-insensitively and leaves out Arabic terms', () => {
    expect(buildQueriesForCategory(refrigerators)).toEqual(['Refrigerators', 'fridge', 'side by side refrigerator']);
  });
});
