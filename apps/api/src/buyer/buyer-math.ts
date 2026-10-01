/**
 * The pure calculations behind the buyer tools: installments, promo savings,
 * coupon visibility, warranty comparison and the seller caution signal.
 * No I/O, so each rule is unit-tested directly.
 */

const round2 = (value: number) => Math.round(value * 100) / 100;
const pct = (value: number | null | undefined) => (value && Number.isFinite(value) && value > 0 ? value / 100 : 0);

// ─── Installments ──────────────────────────────────────────────────────────

export interface InstallmentTerms {
  months: number;
  markupPct: number;
  adminFeePct: number;
  adminFeeFlat: number;
  downPaymentPct: number;
}

export interface InstallmentQuote {
  downPayment: number;
  monthly: number;
  adminFee: number;
  totalPaid: number;
  /** What the plan costs over paying cash, as a % of the price. */
  extraPct: number;
}

/**
 * Egyptian BNPL and card plans quote a total markup over the financed amount
 * for the tenor, plus an admin fee taken up front. The down payment is not
 * financed.
 */
export function quoteInstallment(price: number, terms: InstallmentTerms): InstallmentQuote {
  const months = Math.max(1, Math.floor(terms.months));
  const downPayment = round2(price * pct(terms.downPaymentPct));
  const financed = price - downPayment;
  const adminFee = round2(financed * pct(terms.adminFeePct) + Math.max(0, terms.adminFeeFlat));
  const repaid = financed * (1 + pct(terms.markupPct));
  const monthly = round2(repaid / months);
  const totalPaid = round2(downPayment + repaid + adminFee);
  return { downPayment, monthly, adminFee, totalPaid, extraPct: price > 0 ? round2(((totalPaid - price) / price) * 100) : 0 };
}

export function fitsAmount(price: number, min: number | null, max: number | null): boolean {
  return (min === null || price >= min) && (max === null || price <= max);
}

// ─── Promos ────────────────────────────────────────────────────────────────

export interface PromoTerms {
  valueType: 'PERCENT' | 'AMOUNT';
  value: number;
  maxDiscount: number | null;
  minSpend: number | null;
}

/** What a promo takes off this price; 0 when the price is under the minimum spend. */
export function promoSaving(price: number, promo: PromoTerms): number {
  if (promo.minSpend !== null && price < promo.minSpend) return 0;
  const raw = promo.valueType === 'PERCENT' ? price * pct(promo.value) : Math.max(0, promo.value);
  const capped = promo.maxDiscount !== null ? Math.min(raw, promo.maxDiscount) : raw;
  return round2(Math.min(capped, price));
}

export interface CouponEvidence {
  verified: boolean;
  lastVerifiedAt: Date | null;
  workedCount: number;
  failedCount: number;
  lastWorkedReportAt: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Only codes with recent evidence are shown: admin-verified in the last 30
 * days, or reported working by a buyer in the last 14 days and not mostly
 * failing. A code buyers keep reporting as broken disappears on its own.
 */
export function couponVisible(evidence: CouponEvidence, now = new Date()): boolean {
  const mostlyFailing = evidence.failedCount >= 3 && evidence.failedCount > evidence.workedCount;
  if (mostlyFailing) return false;
  const recentlyVerified = evidence.verified && evidence.lastVerifiedAt !== null && now.getTime() - evidence.lastVerifiedAt.getTime() <= 30 * DAY_MS;
  const recentlyWorked = evidence.lastWorkedReportAt !== null && now.getTime() - evidence.lastWorkedReportAt.getTime() <= 14 * DAY_MS;
  return recentlyVerified || recentlyWorked;
}

/** Higher first: verified, then what buyers say. A failure counts double. */
export function couponRank(evidence: CouponEvidence): number {
  return (evidence.verified ? 100 : 0) + evidence.workedCount - 2 * evidence.failedCount;
}

// ─── Warranty ──────────────────────────────────────────────────────────────

export type WarrantyKind = 'LOCAL_AGENT' | 'INTERNATIONAL' | 'SELLER' | 'NONE';
const WARRANTY_RANK: Record<WarrantyKind, number> = { LOCAL_AGENT: 3, INTERNATIONAL: 2, SELLER: 1, NONE: 0 };

/** Positive when `a` is the stronger warranty: kind first, then length. */
export function compareWarranty(a: { type: WarrantyKind; months: number }, b: { type: WarrantyKind; months: number }): number {
  return WARRANTY_RANK[a.type] - WARRANTY_RANK[b.type] || a.months - b.months;
}

// ─── Seller caution ────────────────────────────────────────────────────────

export type CautionSignal = 'FAR_BELOW_MARKET' | 'LOW_RATING' | 'FEW_REVIEWS' | 'NO_FEEDBACK_DATA';

/**
 * A neutral "check before buying" signal for one offer, from what the stores
 * publish (the listing's own rating and review count) and the price against
 * the other stores. Never a verdict on the seller: the caution shows only
 * when a price far below the market meets weak or missing feedback.
 */
export function offerCaution(
  offer: { price: number; rating: number | null; reviewCount: number | null },
  marketMedian: number | null,
  storeCount: number,
): { caution: boolean; signals: CautionSignal[] } {
  const signals: CautionSignal[] = [];
  if (marketMedian !== null && storeCount >= 3 && offer.price < marketMedian * 0.7) signals.push('FAR_BELOW_MARKET');
  if (offer.rating !== null && offer.rating < 3.5 && (offer.reviewCount ?? 0) >= 5) signals.push('LOW_RATING');
  // Most stores do not show us a listing's reviews at all; that is "we can't
  // tell", which is different from "it has few".
  if (offer.reviewCount === null) signals.push('NO_FEEDBACK_DATA');
  else if (offer.reviewCount < 5) signals.push('FEW_REVIEWS');
  const caution = signals.includes('FAR_BELOW_MARKET') && signals.length > 1;
  return { caution, signals };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
