import { FuzzyMatcherService } from '../../src/matching/fuzzy-matcher.service';
import { NormalizerService } from '../../src/matching/normalizer.service';
import {
  CandidateSource,
  CatalogCandidate,
  FUZZY_MATCH_THRESHOLD,
  MAX_JUDGED_CANDIDATES,
  MODEL_AGREEMENT_SCORE,
  MatchingTools,
  RankedCandidate,
  SameProductJudge,
  ScrapedListing,
  checkCategorySanity,
  checkConflicts,
  checkMarketOutlier,
  decideMatch,
  detectJunkListing,
  findCanonicalMatch,
  findExactTitleMatch,
  hasUsablePrice,
  identifierLookupClauses,
  identifiersConflict,
  keepAdvertisedPrice,
  normalizeListing,
  rankCandidates,
  toBasePrices,
} from '../../src/matching/pipeline';

/**
 * Unit tests for each step of the ingestion matching pipeline
 * (src/matching/pipeline). Real normalizer and fuzzy matcher: they are
 * stateless, and the point is to test the decisions, not a mock of them.
 */

const tools: MatchingTools = { normalizer: new NormalizerService(), fuzzy: new FuzzyMatcherService() };
const NO_IDS = { gtin: null, upc: null, ean: null, mpn: null };

function scraped(title: string, extra: Partial<ScrapedListing> = {}): ScrapedListing {
  return { title, priceUsd: 1000, currency: 'EGP', brand: null, model: null, identifiers: NO_IDS, ...extra };
}

let nextId = 0;
function candidate(title: string, extra: Partial<CatalogCandidate> = {}): CatalogCandidate {
  nextId += 1;
  return {
    id: `c${nextId}`,
    title,
    normalizedTitle: tools.normalizer.normalizeTitle(title).normalized,
    brand: tools.normalizer.extractAttributes(title).brand ?? null,
    model: null,
    ...NO_IDS,
    ...extra,
  };
}

const input = (title: string, extra: Partial<ScrapedListing> = {}) => normalizeListing(scraped(title, extra), tools);

function judge(verdicts: Array<boolean | null>): SameProductJudge & { calls: number } {
  const fake = {
    calls: 0,
    async judgeSameProduct() {
      const verdict = fake.calls < verdicts.length ? verdicts[fake.calls] : false;
      fake.calls += 1;
      return verdict;
    },
  };
  return fake;
}

describe('matching pipeline', () => {
  describe('step 1: price gate', () => {
    it.each([
      [1, true],
      [0.01, true],
      [0, false],
      [-5, false],
      [null, false],
      [undefined, false],
      [Number.NaN, false],
      [Number.POSITIVE_INFINITY, false],
    ])('%p usable: %p', (price, usable) => {
      expect(hasUsablePrice(price as number | null | undefined)).toBe(usable);
    });
  });

  describe('step 2: junk filter', () => {
    it('flags sponsored cards and wholesale lots', () => {
      expect(detectJunkListing('Sponsored Samsung Galaxy S26 Ultra')).toBe('sponsored result');
      expect(detectJunkListing('  sponsored Apple iPhone')).toBe('sponsored result');
      expect(detectJunkListing('RTX 5090 bulk order 100 pcs')).toBe('bulk/wholesale offer');
      expect(detectJunkListing('Phone cases MOQ 50')).toBe('bulk/wholesale offer');
    });

    it('lets ordinary titles through, including "sponsored" mid-title', () => {
      expect(detectJunkListing('Samsung Galaxy A57 5G 256GB')).toBeNull();
      expect(detectJunkListing('Galaxy S26 (not sponsored)')).toBeNull();
    });
  });

  describe('step 3: normalize and extract', () => {
    it('normalizes the title and reads attributes, taking store fields as hints', () => {
      const result = normalizeListing(
        scraped('Samsung Galaxy A57 5G 8GB RAM 256GB Awesome Navy', { brand: 'Samsung' }),
        tools,
      );
      expect(result.normalized.normalized).toBe('samsung galaxy a57 5g 8gb ram 256gb awesome navy');
      expect(result.extracted.brand).toBe('Samsung');
      expect(result.extracted.storage).toBe('256GB');
      expect(result.extracted.ram).toBe('8GB');
    });
  });

  describe('step 4: currency', () => {
    const toEgp = async (amount: number, currency: string) => (currency === 'AED' ? amount * 13 : amount);

    it('converts the live price and keeps a higher advertised price', async () => {
      expect(await toBasePrices(scraped('x', { priceUsd: 100, advertisedPrice: 120, currency: 'AED' }), toEgp)).toEqual({
        price: 1300,
        advertisedPrice: 1560,
      });
    });

    it('drops an advertised price that is not above the live price', async () => {
      expect(await toBasePrices(scraped('x', { priceUsd: 100, advertisedPrice: 100 }), toEgp)).toEqual({
        price: 100,
        advertisedPrice: null,
      });
      expect(keepAdvertisedPrice(90, 100)).toBeNull();
      expect(keepAdvertisedPrice(null, 100)).toBeNull();
    });

    it('never converts an advertised price without a live one', async () => {
      const convert = jest.fn(toEgp);
      expect(await toBasePrices(scraped('x', { priceUsd: null, advertisedPrice: 120 }), convert)).toEqual({
        price: null,
        advertisedPrice: null,
      });
      expect(convert).not.toHaveBeenCalled();
    });
  });

  describe('step 5: category sanity', () => {
    const base = { categoryName: 'Smartphones', categoryMedian: 16_000 };

    it('does nothing while the category median is unknown', () => {
      expect(checkCategorySanity({ ...base, categoryMedian: null, title: 'Case for iPhone 16', price: 10 }, tools)).toBeNull();
    });

    it('rejects a cheap accessory in a device category', () => {
      expect(checkCategorySanity({ ...base, title: 'Silicone Case for Samsung Galaxy A57', price: 350 }, tools)).toBe(
        'accessory in the Smartphones category',
      );
    });

    it('keeps an accessory-worded device when the title describes the device', () => {
      expect(checkCategorySanity({ ...base, title: 'Nokia 105 Dual SIM with charger', price: 510 }, tools)).toBeNull();
    });

    it('keeps an expensive listing even if it mentions a case', () => {
      expect(checkCategorySanity({ ...base, title: 'Galaxy A57 with free case', price: 15_000 }, tools)).toBeNull();
    });

    it('applies the accessory rule only to device categories', () => {
      expect(
        checkCategorySanity({ categoryName: 'Headphones', categoryMedian: 3_000, title: 'AirPods with charging case', price: 400 }, tools),
      ).toBeNull();
    });

    it('rejects anything under 2.5% of the median, in any category', () => {
      expect(checkCategorySanity({ ...base, title: 'OPPO A35 HD', price: 298 }, tools)).toBe(
        'price 298 is under 2.5% of the Smartphones median 16000',
      );
      expect(checkCategorySanity({ ...base, title: 'OPPO A35 HD', price: 401 }, tools)).toBeNull();
    });
  });

  describe('step 6: identifiers', () => {
    it('builds one lookup clause per identifier present', () => {
      expect(identifierLookupClauses(NO_IDS)).toEqual([]);
      expect(identifierLookupClauses({ gtin: '1', upc: null, ean: '3', mpn: '' })).toEqual([{ gtin: '1' }, { ean: '3' }]);
    });

    it('conflicts only when both sides carry the same identifier with different values', () => {
      expect(identifiersConflict({ ...NO_IDS, gtin: 'A1' }, { ...NO_IDS, gtin: ' a1 ' })).toBe(false);
      expect(identifiersConflict({ ...NO_IDS, gtin: 'A1' }, { ...NO_IDS, gtin: 'A2' })).toBe(true);
      expect(identifiersConflict({ ...NO_IDS, gtin: 'A1' }, { ...NO_IDS, mpn: 'A2' })).toBe(false);
      expect(identifiersConflict(NO_IDS, NO_IDS)).toBe(false);
    });
  });

  describe('step 7: exact-title match', () => {
    it('returns the first candidate with the same normalized title', () => {
      const first = candidate('Honor X9c 12GB RAM 256GB Titanium Black');
      const second = candidate('Honor X9c 12GB RAM 256GB Titanium Black');
      expect(findExactTitleMatch(input('Honor X9c 12GB RAM 256GB Titanium Black'), [first, second], tools)).toBe(first);
    });

    it('skips a same-title candidate with a different brand, model, identifier or condition', () => {
      const title = 'Galaxy A57 256GB Navy';
      const listing = input(title, { brand: 'Samsung', model: 'A57', identifiers: { ...NO_IDS, gtin: '111' } });
      expect(findExactTitleMatch(listing, [candidate(title, { brand: 'Xiaomi' })], tools)).toBeNull();
      expect(findExactTitleMatch(listing, [candidate(title, { model: 'A56' })], tools)).toBeNull();
      expect(findExactTitleMatch(listing, [candidate(title, { gtin: '222' })], tools)).toBeNull();
      expect(findExactTitleMatch(listing, [candidate(title, { brand: 'Samsung', gtin: '111' })], tools)).not.toBeNull();
    });

    it('returns null when no title is equal', () => {
      expect(findExactTitleMatch(input('Honor X9c 12GB 256GB'), [candidate('Honor X9b 12GB 256GB')], tools)).toBeNull();
    });
  });

  describe('step 8: conflict guards', () => {
    const conflictOf = (listing: string, cand: string) => checkConflicts(input(listing), candidate(cand), tools).conflict;

    it.each([
      ['brand', 'Samsung Galaxy A57 256GB', 'Xiaomi Redmi Note 14 256GB'],
      ['accessory', 'Silicone Case for Samsung Galaxy A57', 'Samsung Galaxy A57 5G 256GB 8GB RAM'],
      ['ram', 'Samsung Galaxy A57 5G 256GB 8GB RAM', 'Samsung Galaxy A57 5G 256GB 12GB RAM'],
      ['storage', 'Samsung Galaxy A57 5G 128GB 8GB RAM', 'Samsung Galaxy A57 5G 256GB 8GB RAM'],
      ['condition', 'Xiaomi Redmi Note 14 Pro 8GB RAM 256GB Refurbished', 'Xiaomi Redmi Note 14 Pro 8GB RAM 256GB'],
      ['chip', 'Apple MacBook Air 13-inch M5 16GB 512GB', 'Apple MacBook Air 13-inch M4 16GB 512GB'],
      ['variant', 'ASUS Dual GeForce RTX 5060 8GB OC', 'ASUS Dual GeForce RTX 5060 Ti 16GB OC'],
    ])('%s guard fires: %s vs %s', (guard, listing, cand) => {
      expect(conflictOf(listing, cand)).toBe(guard);
    });

    it('product-type guard fires: a graphics card vs a laptop naming the same GPU', () => {
      const laptop = candidate('Lenovo LOQ 15 Gaming Laptop RTX 5050 16GB 512GB', { brand: null });
      expect(checkConflicts(input('GeForce RTX 5050 8GB Graphics Card'), laptop, tools).conflict).toBe('product-type');
    });

    it('does not treat color as a conflict (D-6: colors share one product)', () => {
      expect(conflictOf('Samsung Galaxy A57 5G 256GB 8GB RAM Awesome Navy', 'Samsung Galaxy A57 5G 256GB 8GB RAM Awesome Lilac')).toBeNull();
    });

    it('returns the candidate attributes when nothing conflicts', () => {
      const result = checkConflicts(input('OPPO A6 8GB RAM 256GB'), candidate('OPPO A6 Smartphone 256 GB 8 GB RAM'), tools);
      expect(result.conflict).toBeNull();
      expect(result.conflict === null && result.candidateExtracted.storage).toBe('256GB');
    });

    it('checks identifiers and conditions on the fuzzy path too', () => {
      expect(
        checkConflicts(
          input('Apple iPhone 16 Pro 256GB', { identifiers: { ...NO_IDS, gtin: '1' } }),
          candidate('Apple iPhone 16 Pro 256GB', { gtin: '2' }),
          tools,
        ).conflict,
      ).toBe('identifier');
    });
  });

  describe('step 9a: rank', () => {
    it('drops conflicting candidates and sorts the rest strongest first', () => {
      const ram = candidate('Samsung Galaxy A57 5G 256GB 12GB RAM');
      const weak = candidate('Samsung Galaxy A57 256GB 8GB RAM with very long marketing padding text here');
      const strong = candidate('Samsung Galaxy A57 5G 256GB 8GB RAM Navy');
      const ranked = rankCandidates(input('Samsung Galaxy A57 5G 256GB 8GB RAM Black'), [ram, weak, strong], tools);
      expect(ranked.map((r) => r.candidate)).not.toContain(ram);
      expect(ranked.length).toBeGreaterThan(0);
      for (let i = 1; i < ranked.length; i += 1) {
        expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
      }
    });

    it('raises the score to MODEL_AGREEMENT_SCORE when the model number agrees', () => {
      const listing = input('OPPO A6 - 8GB RAM - 256GB - Sapphire Blue');
      const [top] = rankCandidates(listing, [candidate('OPPO A6 Smartphone, 256 GB, Sapphire Blue, Dual SIM, 8 GB RAM')], tools);
      expect(top.score).toBeGreaterThanOrEqual(MODEL_AGREEMENT_SCORE);
    });

    it('keeps the given order among equal scores (stable)', () => {
      const a = candidate('Honor X9c 12GB RAM 256GB Black');
      const b = candidate('Honor X9c 12GB RAM 256GB Black');
      const ranked = rankCandidates(input('Honor X9c 12GB RAM 256GB Black'), [a, b], tools);
      expect(ranked.map((r) => r.candidate)).toEqual([a, b]);
      expect(rankCandidates(input('Honor X9c 12GB RAM 256GB Black'), [b, a], tools).map((r) => r.candidate)).toEqual([b, a]);
    });
  });

  describe('step 9b: decide', () => {
    const c1 = candidate('one');
    const c2 = candidate('two');
    const ranked = (...scores: number[]): Array<RankedCandidate> =>
      scores.map((score, i) => ({ candidate: candidate(`r${i}`), score }));

    it('auto-accepts a model-agreement score without asking the judge', async () => {
      const fake = judge([false]);
      expect(await decideMatch('x', [{ candidate: c1, score: MODEL_AGREEMENT_SCORE }], fake)).toBe(c1);
      expect(fake.calls).toBe(0);
    });

    it('asks the judge in rank order and takes the first "same"', async () => {
      const fake = judge([false, true]);
      expect(await decideMatch('x', [{ candidate: c1, score: 0.7 }, { candidate: c2, score: 0.6 }], fake)).toBe(c2);
      expect(fake.calls).toBe(2);
    });

    it(`asks about at most ${MAX_JUDGED_CANDIDATES} candidates`, async () => {
      const fake = judge([]);
      expect(await decideMatch('x', ranked(...Array(12).fill(0.5)), fake)).toBeNull();
      expect(fake.calls).toBe(MAX_JUDGED_CANDIDATES);
    });

    it('falls back to the fuzzy threshold only when the judge is unavailable', async () => {
      const top = [{ candidate: c1, score: FUZZY_MATCH_THRESHOLD }, { candidate: c2, score: 0.5 }];
      expect(await decideMatch('x', top, judge([null]))).toBe(c1);
      expect(await decideMatch('x', top, judge([false, false]))).toBeNull();
      expect(await decideMatch('x', [{ candidate: c1, score: FUZZY_MATCH_THRESHOLD - 0.01 }], judge([null]))).toBeNull();
    });

    it('stops asking after the first unavailable answer', async () => {
      const fake = judge([null, true]);
      expect(await decideMatch('x', [{ candidate: c1, score: 0.5 }, { candidate: c2, score: 0.4 }], fake)).toBeNull();
      expect(fake.calls).toBe(1);
    });

    it('returns null with no survivors', async () => {
      expect(await decideMatch('x', [], judge([null]))).toBeNull();
    });
  });

  describe('steps 6-9 together: findCanonicalMatch', () => {
    function source(byIdentifier: CatalogCandidate | null, inCategory: CatalogCandidate[]): CandidateSource & { categoryLoads: number } {
      const fake = {
        categoryLoads: 0,
        findByIdentifier: async () => byIdentifier,
        findInCategory: async () => {
          fake.categoryLoads += 1;
          return inCategory;
        },
      };
      return fake;
    }

    it('an identifier hit wins without loading candidates', async () => {
      const hit = candidate('anything');
      const src = source(hit, []);
      expect(await findCanonicalMatch(input('Apple iPhone 16 Pro'), 'cat', { candidates: src, judge: judge([]) }, tools)).toBe(hit);
      expect(src.categoryLoads).toBe(0);
    });

    it('an exact title wins before ranking', async () => {
      const exact = candidate('Honor X9c 12GB RAM 256GB Titanium Black');
      const fake = judge([]);
      expect(
        await findCanonicalMatch(
          input('Honor X9c 12GB RAM 256GB Titanium Black'),
          'cat',
          { candidates: source(null, [candidate('Honor X9b 8GB 128GB'), exact]), judge: fake },
          tools,
        ),
      ).toBe(exact);
      expect(fake.calls).toBe(0);
    });

    it('otherwise ranks and decides', async () => {
      const oppo = candidate('OPPO A6 Smartphone, 256 GB, Sapphire Blue, Dual SIM, 8 GB RAM');
      expect(
        await findCanonicalMatch(
          input('OPPO A6 - 8GB RAM - 256GB - Sapphire Blue'),
          'cat',
          { candidates: source(null, [candidate('Honor X9c 12GB 256GB'), oppo]), judge: judge([]) },
          tools,
        ),
      ).toBe(oppo);
    });

    it('returns null when nothing survives', async () => {
      expect(
        await findCanonicalMatch(
          input('Samsung Galaxy A57 5G 256GB 8GB RAM'),
          'cat',
          { candidates: source(null, [candidate('Samsung Galaxy A57 5G 256GB 12GB RAM')]), judge: judge([null]) },
          tools,
        ),
      ).toBeNull();
    });
  });

  describe('step 10: market outlier', () => {
    const offers = (...prices: number[]) => prices.map((price, i) => ({ price, store: `s${i}` }));

    it('flags a price far from the other stores', () => {
      const result = checkMarketOutlier({ price: 20_000, store: 'me' }, offers(64_999, 63_999, 64_500));
      expect(result.outlier).toBe(true);
      expect(result.median).not.toBeNull();
    });

    it('accepts a price in line with the market', () => {
      expect(checkMarketOutlier({ price: 64_000, store: 'me' }, offers(64_999, 63_999)).outlier).toBe(false);
    });

    it('cannot judge a product with no other offers', () => {
      expect(checkMarketOutlier({ price: 64_000, store: 'me' }, []).outlier).toBe(false);
    });
  });
});
