import {
  DEFAULT_OFFER_MAX_AGE_DAYS,
  dedupeOffers,
  isLiveOffer,
  liveOfferWhere,
  liveOffers,
  offerCutoff,
  offerTitleKey,
  toPrice,
} from '../../src/prices/offer-rules';

const NOW = new Date('2026-09-26T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

function offer(overrides: Record<string, unknown> = {}) {
  return {
    priceUsd: '18999.00',
    inStock: true as boolean | null,
    matchStatus: 'ACCEPTED',
    lastSeenAt: daysAgo(1),
    platformId: 'amazon',
    rawTitle: 'Samsung Galaxy A57 5G 256GB 8GB RAM Awesome Navy',
    ...overrides,
  };
}

describe('offer rules (audit 02, L-10/L-12)', () => {
  describe('isLiveOffer', () => {
    it.each([
      ['a fresh, priced, in-stock, accepted offer', {}, true],
      ['stock unknown (most stores never say)', { inStock: null }, true],
      ['manually accepted', { matchStatus: 'MANUAL_ACCEPT' }, true],
      ['seen exactly at the edge of the window', { lastSeenAt: daysAgo(DEFAULT_OFFER_MAX_AGE_DAYS) }, true],
      ['out of stock', { inStock: false }, false],
      ['stale: not seen for 8 days', { lastSeenAt: daysAgo(8) }, false],
      ['rejected by matching', { matchStatus: 'REJECTED' }, false],
      ['rejected by a human', { matchStatus: 'MANUAL_REJECT' }, false],
      ['a pending (unconfirmed) match', { matchStatus: 'PENDING' }, false],
      ['no price', { priceUsd: null }, false],
      ['a zero price', { priceUsd: '0.00' }, false],
      ['a negative price', { priceUsd: -5 }, false],
      ['a non-numeric price', { priceUsd: 'abc' }, false],
    ])('%s -> %s', (_label, overrides, expected) => {
      expect(isLiveOffer(offer(overrides), { now: NOW })).toBe(expected);
    });

    it('honours a configured window', () => {
      expect(isLiveOffer(offer({ lastSeenAt: daysAgo(20) }), { now: NOW, maxAgeDays: 30 })).toBe(true);
      expect(isLiveOffer(offer({ lastSeenAt: daysAgo(2) }), { now: NOW, maxAgeDays: 1 })).toBe(false);
    });
  });

  it('reads Decimal-like values as numbers', () => {
    expect(toPrice('18999.50')).toBe(18999.5);
    expect(toPrice({ toString: () => '10' })).toBe(10);
    expect(toPrice(Number.NaN)).toBeNull();
    expect(toPrice(undefined)).toBeNull();
  });

  describe('dedupeOffers', () => {
    it('keeps one offer per store and title, the cheapest, whatever the case, spacing or punctuation', () => {
      const a = offer({ priceUsd: '19999' });
      const b = offer({ priceUsd: '18999', rawTitle: 'samsung  galaxy A57 5G, 256GB 8GB RAM - Awesome Navy' });
      const c = offer({ priceUsd: '18999', rawTitle: 'Samsung Galaxy A57 5G 256GB 8GB RAM Awesome Navy ' });
      const kept = dedupeOffers([a, b, c]);
      expect(kept).toHaveLength(1);
      expect(kept[0]).toBe(b);
    });

    it('keeps the same title from different stores', () => {
      expect(dedupeOffers([offer(), offer({ platformId: 'noon' })])).toHaveLength(2);
    });

    it('keeps different titles from one store (different colors are different offers)', () => {
      expect(dedupeOffers([offer(), offer({ rawTitle: 'Samsung Galaxy A57 5G 256GB 8GB RAM Awesome Lilac' })])).toHaveLength(2);
    });

    it('treats Arabic spelling variants as one title', () => {
      expect(offerTitleKey('آيفون ١٦ برو')).toBe(offerTitleKey('ايفون 16 برو'));
    });
  });

  it('liveOffers: filters, dedupes, then drops a price far from the other stores', () => {
    const offers = [
      offer({ platformId: 'amazon', priceUsd: '18999' }),
      offer({ platformId: 'noon', priceUsd: '18799' }),
      offer({ platformId: 'jumia', priceUsd: '18399' }),
      offer({ platformId: '2b', priceUsd: '18650' }),
      offer({ platformId: 'alibaba', priceUsd: '1800', rawTitle: 'Galaxy A57 LCD screen' }),
      offer({ platformId: 'carrefour', priceUsd: '17000', lastSeenAt: daysAgo(40) }),
      offer({ platformId: 'elaraby', priceUsd: '16000', inStock: false }),
    ];
    const kept = liveOffers(offers, { now: NOW }).map((o) => o.platformId);
    expect(kept).toEqual(['amazon', 'noon', 'jumia', '2b']);
  });

  it('the Prisma form keeps listings whose stock is unknown', () => {
    const where = liveOfferWhere({ now: NOW });
    expect(where.OR).toEqual([{ inStock: true }, { inStock: null }]);
    expect(where.lastSeenAt).toEqual({ gte: offerCutoff({ now: NOW }) });
    expect(where.matchStatus).toEqual({ in: ['ACCEPTED', 'MANUAL_ACCEPT'] });
  });
});
