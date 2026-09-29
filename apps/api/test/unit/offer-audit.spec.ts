import { planOfferAudit } from '../../src/matching/repair/offer-audit';

/** The product page from the owner's screenshot (2026-09-29), one offer per store listing. */
const product = { id: 'p1', title: 'Ruijie RG-EW3000GX AX3000 Wi-Fi 6 Dual-band Gigabit Mesh Router' };
const listings = [
  { id: 'l1', rawTitle: 'Ruijie RG-EW3000GX AX3000 Wi-Fi 6 Dual-band Gigabit Mesh Router' },
  { id: 'l2', rawTitle: 'TP-LINK TL-WA3001 AX3000 Gigabit Wi-Fi 6 Access Point, Dual Band' },
  { id: 'l3', rawTitle: 'TP-Link - AX3000 Dual-Band Wi-Fi 6 Range Extender-RE705X' },
  { id: 'l4', rawTitle: 'Xiaomi Mesh System AX3000 Wi-Fi 6 Router Pack Of 1 Black' },
  { id: 'l5', rawTitle: 'ruijie rg-ew3000gx  AX3000 wi-fi 6 dual-band gigabit mesh router' },
];

describe('planOfferAudit', () => {
  it('asks about every offer whose title differs from the product, and not the rest', () => {
    const plan = planOfferAudit(product, listings, new Map());
    expect(plan.toAsk.map((l) => l.id)).toEqual(['l2', 'l3', 'l4']);
  });

  it('splits each offer the judge rejects into its own product and keeps the rest', () => {
    const verdicts = new Map<string, boolean | null>([
      ['l2', false],
      ['l3', false],
      ['l4', null], // judge could not answer: leave it where it is
    ]);
    const plan = planOfferAudit(product, listings, verdicts);
    expect(plan.splits).toEqual([
      { variant: {}, listingIds: ['l2'], detached: true },
      { variant: {}, listingIds: ['l3'], detached: true },
    ]);
    expect(plan.keep.listingIds).toEqual(['l1', 'l4', 'l5']);
  });

  it('plans nothing when the judge approves every offer', () => {
    const verdicts = new Map<string, boolean | null>([
      ['l2', true],
      ['l3', true],
      ['l4', true],
    ]);
    expect(planOfferAudit(product, listings, verdicts).splits).toEqual([]);
  });
});
