import { readFileSync } from 'fs';
import { join } from 'path';
import { listingMatches, usedQuery, usedRange } from '../../src/used-market/used-market';
import { parseOpenSooq } from '../../src/used-market/opensooq.source';

// A real OpenSooq results page for "iphone 13", reduced to titles and prices
// (no names, phones or places were kept).
const page = readFileSync(join(__dirname, '../fixtures/opensooq-iphone13.html'), 'utf8');

describe('used market', () => {
  it('reads titles and EGP prices from the page data', () => {
    const listings = parseOpenSooq(page);
    expect(listings.length).toBeGreaterThan(20);
    expect(listings.every((l) => l.price > 0 && l.title.length > 0)).toBe(true);
  });

  it('matches the model across Arabic and English, and refuses other variants', () => {
    expect(listingMatches('iPhone 13', 'ايفون 13 عادي لونه زيتي')).toBe(true);
    expect(listingMatches('iPhone 13', 'ايفون 13 ميني للبيع')).toBe(false);
    expect(listingMatches('iPhone 13', 'iPhone 13 Pro Max 256')).toBe(false);
    expect(listingMatches('iPhone 13 Pro', 'iPhone 13 Pro 256')).toBe(true);
    expect(listingMatches('iPhone 13', 'iPhone 12 128')).toBe(false);
    expect(listingMatches('iPhone 13', 'جراب ايفون 13 جديد')).toBe(false);
  });

  it('gives a range from the real page, inside a sane band', () => {
    const range = usedRange('iPhone 13', parseOpenSooq(page), 35_000);
    expect(range.sampleSize).toBeGreaterThanOrEqual(5);
    expect(range.p25!).toBeLessThanOrEqual(range.median!);
    expect(range.median!).toBeLessThanOrEqual(range.p75!);
    expect(range.median!).toBeGreaterThan(10_000);
    expect(range.median!).toBeLessThan(35_000);
  });

  it('says nothing with too few listings', () => {
    expect(usedRange('iPhone 13', [{ title: 'iPhone 13', price: 20_000 }], null)).toEqual({ sampleSize: 1, p25: null, median: null, p75: null });
  });

  it('queries brand and model, without repeating the brand', () => {
    expect(usedQuery({ brand: 'Samsung', model: 'Galaxy S25 Ultra' })).toBe('Samsung Galaxy S25 Ultra');
    expect(usedQuery({ brand: 'Xiaomi', model: 'redmi 15c' })).toBe('Xiaomi redmi 15c');
    expect(usedQuery({ brand: 'Apple', model: 'Apple iPhone 15' })).toBe('Apple iPhone 15');
    expect(usedQuery({ brand: null, model: 'iPhone 17' })).toBe('iPhone 17');
    expect(usedQuery({ brand: 'OPPO', model: null })).toBeNull();
  });
});
