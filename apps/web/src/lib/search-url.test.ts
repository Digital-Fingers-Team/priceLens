import { describe, expect, it } from 'vitest';
import { parseSearchParams, searchHref, withChanges } from './search-url';

const parse = (qs: string) => parseSearchParams(new URLSearchParams(qs));

describe('search URL state', () => {
  it('reads every filter, including sort and tier', () => {
    expect(
      parse('q=galaxy&brand=Samsung&categoryId=phones&tier=PREMIUM&minPrice=100&maxPrice=900&sortBy=minPriceUsd&sortDir=asc&page=3'),
    ).toEqual({
      q: 'galaxy',
      brand: 'Samsung',
      categoryId: 'phones',
      tier: 'PREMIUM',
      minPrice: 100,
      maxPrice: 900,
      sortBy: 'minPriceUsd',
      sortDir: 'asc',
      page: 3,
      limit: 20,
    });
  });

  it('falls back to defaults for hand-edited nonsense', () => {
    const f = parse('sortBy=price;drop&sortDir=up&tier=cheap&minPrice=-5&maxPrice=abc&page=0');
    expect(f).toMatchObject({ sortBy: 'relevance', sortDir: 'desc', page: 1 });
    expect(f.tier).toBeUndefined();
    expect(f.minPrice).toBeUndefined();
    expect(f.maxPrice).toBeUndefined();
  });

  it('round-trips through the URL', () => {
    const f = parse('q=tv%20%26%20stand&tier=BUDGET&minPrice=0&sortBy=updatedAt&page=2');
    expect(parseSearchParams(new URL(searchHref(f), 'http://x').searchParams)).toEqual(f);
  });

  it('leaves defaults out of the link', () => {
    expect(searchHref(parse('q=tv&sortBy=relevance&sortDir=desc&page=1'))).toBe('/search?q=tv');
    expect(searchHref(parse(''))).toBe('/search');
  });

  it('keeps a minimum price of 0 (a real filter, not "unset")', () => {
    expect(searchHref(parse('minPrice=0'))).toBe('/search?minPrice=0');
  });

  it('starts from page 1 on any change except the page itself', () => {
    const f = parse('q=tv&page=4');
    expect(withChanges(f, { brand: 'LG' }).page).toBe(1);
    expect(withChanges(f, { page: 5 }).page).toBe(5);
  });
});
