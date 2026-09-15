import {
  AT_MARKET_BAND_PCT,
  CompetitorPrice,
  MIN_COMPETITORS_FOR_POSITION,
  computeMarketPosition,
  recommendPrice,
} from '../../src/seller/market-position';

function competitors(...prices: number[]): CompetitorPrice[] {
  return prices.map((price, index) => ({
    platformId: `p${index}`,
    platformName: `Store ${index}`,
    price,
    inStock: true,
  }));
}

describe('market position', () => {
  it('refuses to call one competitor a market', () => {
    const position = computeMarketPosition(15_000, competitors(14_000));
    expect(position.label).toBe('INSUFFICIENT_DATA');
    expect(position.explanation).toMatch(/not a market median/i);
    expect(MIN_COMPETITORS_FOR_POSITION).toBe(2);
  });

  it('says so when there are no competitors at all', () => {
    const position = computeMarketPosition(15_000, []);
    expect(position.label).toBe('INSUFFICIENT_DATA');
    expect(position.competitorCount).toBe(0);
    expect(position.marketMedian).toBeNull();
  });

  it('reports the market even when our own price is unknown', () => {
    // Useful on its own: a seller who has not entered a price should still
    // see what the market looks like.
    const position = computeMarketPosition(null, competitors(14_000, 14_600, 15_200));
    expect(position.marketMedian).toBe(14_600);
    expect(position.label).toBe('INSUFFICIENT_DATA');
    expect(position.explanation).toMatch(/not yours/i);
  });

  it('matches the brief’s worked example', () => {
    // Your price 14,999; market median 14,300 -> +4.9%.
    //
    // Five competitors, not three: with only 13,900/14,300/14,800 the seller
    // is also the most expensive, which is a different (and correct) label.
    // The brief describes being above the median while still not the dearest.
    const position = computeMarketPosition(14_999, competitors(13_500, 13_900, 14_300, 14_800, 15_500));
    expect(position.marketMedian).toBe(14_300);
    expect(position.vsMedianPct).toBeCloseTo(4.89, 1);
    expect(position.label).toBe('ABOVE_MARKET');
  });

  it('labels the cheapest seller', () => {
    const position = computeMarketPosition(13_000, competitors(13_900, 14_300, 14_800));
    expect(position.label).toBe('CHEAPEST');
    expect(position.gapToCheapest).toBeLessThan(0);
  });

  it('labels the most expensive seller', () => {
    const position = computeMarketPosition(16_000, competitors(13_900, 14_300, 14_800));
    expect(position.label).toBe('MOST_EXPENSIVE');
  });

  it('treats a price inside the band as at market', () => {
    const position = computeMarketPosition(14_300 * (1 + (AT_MARKET_BAND_PCT - 1) / 100), competitors(13_900, 14_300, 14_800));
    expect(position.label).toBe('AT_MARKET');
  });

  it('reports how many competitors we are cheaper than', () => {
    const position = computeMarketPosition(14_000, competitors(13_000, 15_000, 16_000, 17_000));
    expect(position.percentileRank).toBeGreaterThan(50);
  });
});

describe('margin-aware pricing', () => {
  const market = computeMarketPosition(14_999, competitors(13_500, 13_900, 14_300, 14_800, 15_500));

  it('will not recommend without a cost', () => {
    const rec = recommendPrice({
      cost: null,
      currentPrice: 14_999,
      targetMarginPct: 20,
      minMarginPct: 10,
      position: market,
    });
    expect(rec.recommendedPrice).toBeNull();
    expect(rec.confidence).toBe('NONE');
    expect(rec.rationale[0]).toMatch(/unit cost/i);
  });

  it('computes the floor and target from cost and margins', () => {
    const rec = recommendPrice({
      cost: 12_000,
      currentPrice: 14_999,
      targetMarginPct: 20,
      minMarginPct: 10,
      position: market,
    });
    // floor = 12000 / (1 - 0.10) = 13,333; target = 12000 / (1 - 0.20) = 15,000
    expect(rec.floorPrice).toBeCloseTo(13_333, 0);
    expect(rec.targetPrice).toBeCloseTo(15_000, 0);
  });

  it('matches the brief’s worked example', () => {
    // Cost 12,000; current 14,999; median 14,300; floor 13,800.
    // Cheapest competitor 13,900 -> undercut ~13,830, which is above the
    // 13,800 floor but below the 15,000 target.
    const rec = recommendPrice({
      cost: 12_000,
      currentPrice: 14_999,
      targetMarginPct: 20,
      minMarginPct: 13.04, // gives a ~13,800 floor
      position: market,
    });

    expect(rec.recommendedPrice).not.toBeNull();
    expect(rec.recommendedPrice!).toBeLessThan(14_999);
    expect(rec.recommendedPrice!).toBeGreaterThanOrEqual(Math.floor(rec.floorPrice!));
    expect(rec.rationale.join(' ')).toMatch(/cheapest competitor/i);
  });

  it('never recommends below the seller’s minimum margin', () => {
    // The market is far below what this seller can profitably match.
    const cheapMarket = computeMarketPosition(14_999, competitors(9_000, 9_500, 9_800));
    const rec = recommendPrice({
      cost: 12_000,
      currentPrice: 14_999,
      targetMarginPct: 20,
      minMarginPct: 10,
      position: cheapMarket,
    });

    expect(rec.recommendedPrice!).toBeGreaterThanOrEqual(Math.floor(rec.floorPrice!));
    expect(rec.projectedMarginPct!).toBeGreaterThanOrEqual(9.9);
    expect(rec.rationale.join(' ')).toMatch(/below your minimum profitable price/i);
  });

  it('undercuts when doing so still clears the target margin', () => {
    const richMarket = computeMarketPosition(20_000, competitors(19_000, 19_500, 21_000));
    const rec = recommendPrice({
      cost: 10_000,
      currentPrice: 20_000,
      targetMarginPct: 20,
      minMarginPct: 10,
      position: richMarket,
    });

    expect(rec.recommendedPrice!).toBeLessThan(19_000);
    expect(rec.projectedMarginPct!).toBeGreaterThan(20);
    expect(rec.rationale.join(' ')).toMatch(/still clears your/i);
  });

  it('falls back to the seller’s own numbers when there is no market', () => {
    const noMarket = computeMarketPosition(14_999, competitors(13_900));
    const rec = recommendPrice({
      cost: 12_000,
      currentPrice: 14_999,
      targetMarginPct: 25,
      minMarginPct: 10,
      position: noMarket,
    });

    expect(rec.confidence).toBe('LOW');
    expect(rec.recommendedPrice).toBeCloseTo(16_000, -2);
    expect(rec.rationale.join(' ')).toMatch(/not enough competitor prices/i);
  });

  it('scales confidence with how much of the market we can see', () => {
    const wide = computeMarketPosition(15_000, competitors(14_000, 14_200, 14_500, 14_800, 15_500));
    const narrow = computeMarketPosition(15_000, competitors(14_000, 14_500));

    const base = { cost: 10_000, currentPrice: 15_000, targetMarginPct: 20, minMarginPct: 10 };
    expect(recommendPrice({ ...base, position: wide }).confidence).toBe('HIGH');
    expect(recommendPrice({ ...base, position: narrow }).confidence).toBe('LOW');
  });

  it('always states what the recommendation does not account for', () => {
    const rec = recommendPrice({
      cost: 12_000,
      currentPrice: 14_999,
      targetMarginPct: 20,
      minMarginPct: 10,
      position: market,
    });
    expect(rec.caveat).toMatch(/not a guarantee of higher profit/i);
  });

  it('reports the current margin so the seller can judge the change', () => {
    const rec = recommendPrice({
      cost: 12_000,
      currentPrice: 15_000,
      targetMarginPct: 20,
      minMarginPct: 10,
      position: market,
    });
    expect(rec.currentMarginPct).toBeCloseTo(20, 0);
  });
});
