import { parseQuery } from '../../src/deal-hunter/constraint-parser';

describe('Deal Hunter constraint parser', () => {
  it('parses the brief’s worked example', () => {
    const parsed = parseQuery('I need a laptop under 40,000 EGP with RTX 4060');

    expect(parsed.categorySlugs).toEqual(['laptops']);
    expect(parsed.price.max).toBe(40_000);
    expect(parsed.price.min).toBeNull();
    expect(parsed.specs).toContainEqual(expect.objectContaining({ field: 'gpu', value: 'RTX 4060' }));
    expect(parsed.isEmpty).toBe(false);
  });

  it('does not mistake a GPU model number for a budget', () => {
    // The trap: "RTX 4060" contains 4060, which a naive price parser reads as
    // a 4,060 EGP budget and then finds nothing.
    const parsed = parseQuery('laptop with RTX 4060');
    expect(parsed.price.max).toBeNull();
    expect(parsed.price.min).toBeNull();
    expect(parsed.specs[0].value).toBe('RTX 4060');
  });

  describe('prices', () => {
    it.each([
      ['under 40000', 40_000],
      ['below 40,000', 40_000],
      ['less than 40k', 40_000],
      ['up to 40 000', 40_000],
      ['max 40000 EGP', 40_000],
      ['no more than 40,000', 40_000],
      ['40,000 EGP', 40_000],
      ['15k', null],
    ])('reads "%s" as a ceiling of %s', (phrase, expected) => {
      expect(parseQuery(`laptop ${phrase}`).price.max).toBe(expected);
    });

    it('reads a lower bound', () => {
      expect(parseQuery('tv over 20000').price.min).toBe(20_000);
      expect(parseQuery('tv at least 20,000 EGP').price.min).toBe(20_000);
    });

    it('reads a range', () => {
      const parsed = parseQuery('phone between 10,000 and 20,000 EGP');
      expect(parsed.price.min).toBe(10_000);
      expect(parsed.price.max).toBe(20_000);
    });

    it('orders a reversed range correctly', () => {
      const parsed = parseQuery('phone between 20000 and 10000');
      expect(parsed.price.min).toBe(10_000);
      expect(parsed.price.max).toBe(20_000);
    });

    it('expands k and m shorthand', () => {
      expect(parseQuery('laptop under 40k').price.max).toBe(40_000);
      expect(parseQuery('house under 2m').price.max).toBe(2_000_000);
    });

    it('treats a dot as a thousands separator only in that shape', () => {
      expect(parseQuery('laptop under 40.000 EGP').price.max).toBe(40_000);
    });
  });

  describe('categories', () => {
    it.each([
      ['laptop', 'laptops'],
      ['notebook', 'laptops'],
      ['smartphone', 'smartphones'],
      ['iphone', 'smartphones'],
      ['tv', 'televisions'],
      ['graphics card', 'graphics-cards'],
      ['headphones', 'headphones'],
      ['ps5', 'gaming-consoles'],
      ['washing machine', 'home-appliances'],
    ])('maps "%s" to %s', (word, slug) => {
      expect(parseQuery(`a ${word} under 10000`).categorySlugs).toContain(slug);
    });

    it('prefers the longer term when two could match', () => {
      // "graphics card" must win over a bare "card".
      expect(parseQuery('graphics card under 30000').categorySlugs).toEqual(['graphics-cards']);
    });
  });

  describe('specs', () => {
    it('parses GPUs with and without a suffix', () => {
      expect(parseQuery('rtx 4060 ti').specs[0].value).toBe('RTX 4060 TI');
      expect(parseQuery('RTX4070').specs[0].value).toBe('RTX 4070');
      expect(parseQuery('rx 7800 xt').specs[0].value).toBe('RX 7800 XT');
    });

    it('parses CPUs', () => {
      expect(parseQuery('laptop with i7').specs).toContainEqual(
        expect.objectContaining({ field: 'cpu', value: 'i7' }),
      );
      expect(parseQuery('ryzen 7 5800x laptop').specs).toContainEqual(
        expect.objectContaining({ field: 'cpu', value: 'Ryzen 7 5800X' }),
      );
      expect(parseQuery('macbook m3 pro').specs).toContainEqual(
        expect.objectContaining({ field: 'cpu', value: 'M3 Pro' }),
      );
    });

    it('only reads RAM when the word is present', () => {
      // A bare "16GB" is ambiguous with storage, so it must not be claimed.
      expect(parseQuery('laptop 16gb ram').specs).toContainEqual(
        expect.objectContaining({ field: 'ram', value: '16GB' }),
      );
      expect(parseQuery('laptop 16gb').specs.filter((s) => s.field === 'ram')).toHaveLength(0);
    });

    it('parses storage', () => {
      expect(parseQuery('laptop 512gb ssd').specs).toContainEqual(
        expect.objectContaining({ field: 'storage', value: '512GB' }),
      );
      expect(parseQuery('laptop 1tb').specs).toContainEqual(
        expect.objectContaining({ field: 'storage', value: '1TB' }),
      );
    });

    it('parses screen size', () => {
      expect(parseQuery('55 inch tv').specs).toContainEqual(
        expect.objectContaining({ field: 'displaySize', value: '55 inch' }),
      );
      expect(parseQuery('15.6" laptop').specs).toContainEqual(
        expect.objectContaining({ field: 'displaySize', value: '15.6 inch' }),
      );
    });

    it('does not repeat the same spec twice', () => {
      const parsed = parseQuery('rtx 4060 laptop with rtx 4060');
      expect(parsed.specs.filter((s) => s.field === 'gpu')).toHaveLength(1);
    });
  });

  describe('brands', () => {
    it('recognises a brand and removes it from the free text', () => {
      const parsed = parseQuery('lenovo laptop under 40000');
      expect(parsed.brands).toEqual(['lenovo']);
      expect(parsed.unparsed).not.toContain('lenovo');
    });

    it('handles several brands', () => {
      expect(parseQuery('samsung or lg tv').brands).toEqual(expect.arrayContaining(['samsung', 'lg']));
    });
  });

  describe('leftovers', () => {
    it('strips filler words from the free text', () => {
      const parsed = parseQuery('I need a good laptop for work under 40000');
      expect(parsed.unparsed).not.toMatch(/\b(i|need|a|good|for)\b/);
      expect(parsed.unparsed).toContain('work');
    });

    it('keeps unrecognised words rather than dropping them', () => {
      // Degrades to ordinary search instead of silently ignoring the user.
      const parsed = parseQuery('thunderbolt dock under 5000');
      expect(parsed.unparsed).toContain('thunderbolt');
      expect(parsed.price.max).toBe(5_000);
    });

    it('reports an empty query as empty', () => {
      expect(parseQuery('').isEmpty).toBe(true);
      expect(parseQuery('   ').isEmpty).toBe(true);
    });

    it('is not empty when anything at all was understood', () => {
      expect(parseQuery('laptop').isEmpty).toBe(false);
    });
  });
});
