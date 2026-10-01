/**
 * What a cross-border offer costs at the buyer's door in Egypt, in EGP.
 *
 * Listing prices are already converted to EGP at ingestion (the FX step of
 * the matching pipeline), so this only adds what the store's price leaves
 * out. Egyptian customs assess duty on the goods plus shipping, and VAT on
 * that plus the duty; handling is a flat clearance / courier fee.
 */
export interface LandedCostRuleValues {
  shippingFlat: number;
  shippingPct: number;
  customsPct: number;
  vatPct: number;
  handlingFee: number;
}

export interface LandedCostBreakdown {
  price: number;
  shipping: number;
  customs: number;
  vat: number;
  handling: number;
  total: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const pct = (value: number) => (Number.isFinite(value) && value > 0 ? value / 100 : 0);

export function computeLandedCost(price: number, rule: LandedCostRuleValues): LandedCostBreakdown {
  const shipping = round2(Math.max(0, rule.shippingFlat) + price * pct(rule.shippingPct));
  const dutiable = price + shipping;
  const customs = round2(dutiable * pct(rule.customsPct));
  const vat = round2((dutiable + customs) * pct(rule.vatPct));
  const handling = round2(Math.max(0, rule.handlingFee));
  return { price: round2(price), shipping, customs, vat, handling, total: round2(price + shipping + customs + vat + handling) };
}
