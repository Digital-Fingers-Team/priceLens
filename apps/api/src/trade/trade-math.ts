/**
 * Pure arithmetic behind the importer tools: import-opportunity scoring, FX
 * scenarios, the trend radar's week boundaries, and the CBE rate table parser.
 * No I/O here, so every rule can be tested on its own.
 */

const round2 = (value: number) => Math.round(value * 100) / 100;

export function median(values: number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Standard deviation over the mean, in %. Null below 3 points: two days say nothing about stability. */
export function volatilityPct(values: number[]): number | null {
  const points = values.filter((v) => Number.isFinite(v) && v > 0);
  if (points.length < 3) return null;
  const mean = points.reduce((sum, v) => sum + v, 0) / points.length;
  const variance = points.reduce((sum, v) => sum + (v - mean) ** 2, 0) / points.length;
  return round2((Math.sqrt(variance) / mean) * 100);
}

export interface DemandSignals {
  /** Local stores carrying the product. */
  localStores: number;
  /** Views, clicks, watchlist adds and alerts over 30 days. */
  interest: number;
  /** Reviews on the local listings, where a store shows them. */
  reviewCount: number | null;
  volatilityPct: number | null;
}

/**
 * 0..1. More local stores means a proven market; interest and reviews mean
 * buyers look for it; a stable local price means the margin will still be
 * there when the shipment lands. Each part saturates so no single signal
 * (one viral product page) can carry the score.
 */
export function demandScore(signals: DemandSignals): number {
  const stores = Math.min(1, Math.max(0, signals.localStores - 1) / 4);
  const interest = Math.min(1, Math.log10(1 + Math.max(0, signals.interest)) / 2);
  const reviews = signals.reviewCount == null ? 0 : Math.min(1, Math.log10(1 + signals.reviewCount) / 3);
  // Unknown stability is neither rewarded nor punished.
  const stability = signals.volatilityPct == null ? 0.5 : Math.max(0, 1 - signals.volatilityPct / 20);
  return round2(0.4 * stores + 0.25 * interest + 0.1 * reviews + 0.25 * stability) || 0;
}

export interface OpportunityInput {
  landedCost: number;
  localMedian: number;
}

export interface OpportunityMargin {
  marginEgp: number;
  marginPct: number;
}

/** Margin against the local median, as a share of the local price. */
export function opportunityMargin(input: OpportunityInput): OpportunityMargin {
  const marginEgp = round2(input.localMedian - input.landedCost);
  const marginPct = input.localMedian > 0 ? round2((marginEgp / input.localMedian) * 100) : 0;
  return { marginEgp, marginPct };
}

/**
 * Ranking: margin, damped by demand. Margins above 60 % are capped: they are
 * as often a mismatched product (a case sold as the phone) as a real gap,
 * and must not float to the top on that alone.
 */
export function opportunityScore(marginPct: number, demand: number): number {
  const margin = Math.min(60, Math.max(0, marginPct)) / 60;
  return round2(100 * margin * (0.35 + 0.65 * demand));
}

/** A margin this large is shown with a "check it is the same product" note. */
export const SUSPICIOUS_MARGIN_PCT = 60;

// ── FX ────────────────────────────────────────────────────────────────

export interface FxScenario {
  /** EGP per USD in this scenario. */
  rate: number;
  /** Change against today's rate, in %. */
  changePct: number;
  landedCost: number;
  /** Against the local price, when there is one. */
  marginEgp: number | null;
  marginPct: number | null;
}

/**
 * The cross-border price is set in dollars and converted at the store, so it
 * moves with the dollar; customs and VAT are percentages of it and move too.
 * Only flat fees stay put. `landedAt` recomputes the landed cost from an EGP
 * price, so the scenario is the price scaled by rate / today's rate.
 */
export function fxScenarios(
  price: number,
  todayRate: number,
  rates: number[],
  landedAt: (price: number) => number,
  localPrice: number | null,
): FxScenario[] {
  if (!(todayRate > 0) || !(price > 0)) return [];
  return rates
    .filter((rate) => rate > 0)
    .map((rate) => {
      const landedCost = round2(landedAt(price * (rate / todayRate)));
      const margin = localPrice && localPrice > 0 ? opportunityMargin({ landedCost, localMedian: localPrice }) : null;
      return {
        rate: round2(rate),
        changePct: round2(((rate - todayRate) / todayRate) * 100),
        landedCost,
        marginEgp: margin?.marginEgp ?? null,
        marginPct: margin?.marginPct ?? null,
      };
    });
}

/** The dollar rate at which the import stops beating the local price (margin 0). */
export function breakEvenRate(price: number, todayRate: number, landedAt: (price: number) => number, localPrice: number): number | null {
  if (!(price > 0) || !(todayRate > 0) || !(localPrice > 0)) return null;
  // Landed cost is increasing in the rate; bisect between 1 % and 10x today.
  let lo = todayRate * 0.01;
  let hi = todayRate * 10;
  if (landedAt(price * (hi / todayRate)) < localPrice) return null; // never stops beating it
  if (landedAt(price * (lo / todayRate)) > localPrice) return null; // never beats it
  for (let i = 0; i < 50; i += 1) {
    const mid = (lo + hi) / 2;
    if (landedAt(price * (mid / todayRate)) < localPrice) lo = mid;
    else hi = mid;
  }
  return round2((lo + hi) / 2);
}

// ── Weeks ─────────────────────────────────────────────────────────────

/** YYYY-MM-DD of a date in a time zone. */
export function zonedDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/**
 * The Saturday that starts the week containing `day` (YYYY-MM-DD). The
 * Egyptian week starts on Saturday, after the Friday weekend.
 */
export function weekStartOf(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const back = (date.getUTCDay() + 1) % 7; // Sat=0, Sun=1, ... Fri=6
  date.setUTCDate(date.getUTCDate() - back);
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Relative change in %, with a floor on the base so 1 -> 3 is not "+200 %". */
export function growthPct(now: number, before: number, floor = 5): number {
  return round2(((now - before) / Math.max(before, floor)) * 100);
}

/**
 * Trend score: supply and interest growth, plus the size of the price move
 * (either way: a falling price is news too). Clamped so a single quiet
 * category waking up cannot dwarf the rest forever.
 */
export function trendScore(input: { supplyGrowthPct: number; interestGrowthPct: number; priceChangePct: number | null }): number {
  const clamp = (v: number) => Math.max(-200, Math.min(200, v));
  return round2(
    0.45 * clamp(input.supplyGrowthPct) + 0.35 * clamp(input.interestGrowthPct) + 2 * Math.min(25, Math.abs(input.priceChangePct ?? 0)),
  );
}

// ── CBE rate table ────────────────────────────────────────────────────

export interface ParsedCbeRates {
  /** YYYY-MM-DD the table is for. */
  rateDate: string | null;
  rates: Array<{ currency: string; buy: number; sell: number }>;
}

/** Names on the English rates page to ISO codes; the yen is quoted per 100. */
const CBE_CURRENCIES: Array<[RegExp, string, number]> = [
  [/^us dollar$/i, 'USD', 1],
  [/^euro$/i, 'EUR', 1],
  [/^pound sterling$/i, 'GBP', 1],
  [/^saudi riyal$/i, 'SAR', 1],
  [/^uae dirham$/i, 'AED', 1],
  [/^kuwaiti dinar$/i, 'KWD', 1],
  [/^qatari riyal$/i, 'QAR', 1],
  [/^chinese yuan$/i, 'CNY', 1],
  [/^japanese yen 100$/i, 'JPY', 100],
];

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The official rates page: "Rates for Date: DD/MM/YYYY" and a table of
 * Currency | Buy | Sell. Rows we cannot name or whose numbers are not
 * positive are skipped rather than guessed.
 */
export function parseCbeRates(html: string): ParsedCbeRates {
  const dateMatch = /Rates for Date:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(html) ?? /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(html);
  const rateDate = dateMatch ? `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}` : null;

  const rates: ParsedCbeRates['rates'] = [];
  const seen = new Set<string>();
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (row.match(/<td[\s\S]*?<\/td>/gi) ?? []).map(text);
    if (cells.length < 3) continue;
    const known = CBE_CURRENCIES.find(([pattern]) => pattern.test(cells[0]));
    if (!known) continue;
    const [, code, per] = known;
    const buy = Number(cells[1].replace(/,/g, '')) / per;
    const sell = Number(cells[2].replace(/,/g, '')) / per;
    if (seen.has(code) || !(buy > 0) || !(sell > 0)) continue;
    seen.add(code);
    rates.push({ currency: code, buy: Math.round(buy * 1e4) / 1e4, sell: Math.round(sell * 1e4) / 1e4 });
  }
  return { rateDate, rates };
}
