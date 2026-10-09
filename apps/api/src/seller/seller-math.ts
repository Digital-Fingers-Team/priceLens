/**
 * Seller arithmetic: net profit per platform, repricer suggestions, and
 * finding a listing in a store's search results.
 *
 * Pure and Prisma-free so every boundary is directly testable. Money is in
 * EGP, rounded to piastres only at the edges.
 */

export interface FeeTerms {
  /** Platform commission, % of the selling price. */
  commissionPct: number;
  /** Fixed fee per order (closing fee, payment fee). */
  fixedFee: number;
  /** Shipping the seller pays per order. */
  shippingFee: number;
  /** Expected returns, as % of the selling price lost to them. */
  returnRatePct: number;
  /** VAT included in the selling price, %. 0 for a seller not registered for VAT. */
  vatPct: number;
  /** Tiered commission: commissionPct up to this price, commissionPctAbove beyond it. */
  tierUpTo?: number | null;
  commissionPctAbove?: number | null;
  /** The bracket's rate applies to the whole price, not only the portion above the tier. */
  tierWholePrice?: boolean;
  /** The smallest commission charged per item. */
  minCommission?: number;
}

const isTiered = (fees: FeeTerms): fees is FeeTerms & { tierUpTo: number; commissionPctAbove: number } =>
  fees.tierUpTo != null && fees.tierUpTo > 0 && fees.commissionPctAbove != null;

/** The store's commission on one item at this price, tiers and minimum applied. */
export function commissionFor(price: number, fees: FeeTerms): number {
  let commission = (price * fees.commissionPct) / 100;
  if (isTiered(fees) && price > fees.tierUpTo) {
    commission = fees.tierWholePrice
      ? (price * fees.commissionPctAbove) / 100
      : (fees.tierUpTo * fees.commissionPct + (price - fees.tierUpTo) * fees.commissionPctAbove) / 100;
  }
  return price > 0 ? Math.max(commission, fees.minCommission ?? 0) : commission;
}

export interface ProfitBreakdown {
  price: number;
  commission: number;
  fixedFee: number;
  shipping: number;
  returns: number;
  vat: number;
  cost: number | null;
  /** Price minus every fee and the cost; null without a cost. */
  netProfit: number | null;
  /** Net profit as % of the selling price. */
  marginPct: number | null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * selling price − commission − fixed fees − shipping − expected returns − VAT − cost.
 *
 * VAT is the part of a VAT-inclusive price owed to the tax authority:
 * price − price / (1 + vat%). It is not a cost on top of the price.
 */
export function computeProfit(price: number, cost: number | null, fees: FeeTerms): ProfitBreakdown {
  const commission = commissionFor(price, fees);
  const returns = (price * fees.returnRatePct) / 100;
  const vat = fees.vatPct > 0 ? price - price / (1 + fees.vatPct / 100) : 0;
  const before = price - commission - fees.fixedFee - fees.shippingFee - returns - vat;
  const netProfit = cost === null ? null : before - cost;
  return {
    price: round2(price),
    commission: round2(commission),
    fixedFee: round2(fees.fixedFee),
    shipping: round2(fees.shippingFee),
    returns: round2(returns),
    vat: round2(vat),
    cost: cost === null ? null : round2(cost),
    netProfit: netProfit === null ? null : round2(netProfit),
    marginPct: netProfit === null || price <= 0 ? null : Math.round((netProfit / price) * 1000) / 10,
  };
}

/**
 * The lowest price that still covers every fee and the cost (net profit 0),
 * solved from computeProfit. Null when the fees eat the whole price.
 */
export function breakEvenPrice(cost: number, fees: FeeTerms): number | null {
  // The commission is linear (a + b * price) within each regime: the
  // minimum, the rate below the tier, and the rate above it. Net profit rises
  // within a regime; at a whole-price tier it jumps, so the price just above
  // the tier is a candidate too. The lowest candidate that breaks even wins.
  const regimes: Array<[number, number]> = [[fees.minCommission ?? 0, 0], [0, fees.commissionPct / 100]];
  if (isTiered(fees)) {
    regimes.push(
      fees.tierWholePrice
        ? [0, fees.commissionPctAbove / 100]
        : [(fees.tierUpTo * (fees.commissionPct - fees.commissionPctAbove)) / 100, fees.commissionPctAbove / 100],
    );
  }
  const otherShare = fees.returnRatePct / 100 + (fees.vatPct > 0 ? 1 - 1 / (1 + fees.vatPct / 100) : 0);
  let best: number | null = null;
  for (const [a, b] of regimes) {
    const share = 1 - b - otherShare;
    if (share <= 0) continue;
    const price = (cost + fees.fixedFee + fees.shippingFee + a) / share;
    if (price <= 0 || Math.abs(commissionFor(price, fees) - (a + b * price)) > 0.005) continue;
    if (best === null || price < best) best = price;
  }
  if (isTiered(fees) && fees.tierWholePrice) {
    const edge = fees.tierUpTo + 0.01;
    if ((best === null || edge < best) && (computeProfit(edge, cost, fees).netProfit ?? -1) >= 0) best = edge;
  }
  return best === null ? null : Math.ceil(best * 100) / 100;
}

export type RepricerStrategy = 'BEAT_LOWEST' | 'MATCH_LOWEST';

export interface RepricerInput {
  strategy: RepricerStrategy;
  /** How far below the lowest competitor, in EGP (BEAT_LOWEST only). */
  offset: number;
  floor: number | null;
  ceiling: number | null;
  currentPrice: number | null;
  /** Cheapest in-stock competitor, excluding the seller's own store. */
  lowestCompetitor: number | null;
}

export type RepricerReason =
  | 'NO_COMPETITOR'
  | 'BEAT_LOWEST'
  | 'MATCH_LOWEST'
  | 'HELD_AT_FLOOR'
  | 'HELD_AT_CEILING'
  | 'ALREADY_THERE';

export interface RepricerSuggestion {
  price: number | null;
  reason: RepricerReason;
}

/**
 * One suggested price under a seller's rule. Never below the floor, never
 * above the ceiling; with no competitor in stock there is nothing to react
 * to, so nothing is suggested.
 */
export function suggestPrice(input: RepricerInput): RepricerSuggestion {
  if (input.lowestCompetitor === null || input.lowestCompetitor <= 0) return { price: null, reason: 'NO_COMPETITOR' };

  let target = input.strategy === 'BEAT_LOWEST' ? input.lowestCompetitor - Math.max(0, input.offset) : input.lowestCompetitor;
  let reason: RepricerReason = input.strategy;
  if (input.floor !== null && target < input.floor) {
    target = input.floor;
    reason = 'HELD_AT_FLOOR';
  }
  if (input.ceiling !== null && target > input.ceiling) {
    target = input.ceiling;
    reason = 'HELD_AT_CEILING';
  }
  target = round2(target);
  if (input.currentPrice !== null && Math.abs(input.currentPrice - target) < 0.01) return { price: target, reason: 'ALREADY_THERE' };
  return { price: target, reason };
}

/** Host and path without query, fragment, trailing slash or locale prefix, lower-cased. */
export function listingKey(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const path = decodeURIComponent(url.pathname)
    .replace(/\/+$/, '')
    .replace(/^\/(ar|en)(-[a-z]{2})?(?=\/)/i, '')
    .replace(/^\/(egypt-(ar|en))(?=\/)/i, '')
    .replace(/^\/-\/(ar|en)(?=\/)/i, '')
    .toLowerCase();
  return `${host}${path}`;
}

/**
 * 1-based position of the seller's listing in one store's search results,
 * or null when it is not among them. Matches on the listing's URL, or its
 * store id when the URL carries tracking variants.
 */
export function rankOf(results: Array<{ externalId: string; externalUrl: string }>, target: { url: string | null; externalId: string | null }): number | null {
  const key = target.url ? listingKey(target.url) : null;
  const index = results.findIndex(
    (result) =>
      (key !== null && listingKey(result.externalUrl) === key) ||
      (target.externalId !== null && result.externalId === target.externalId),
  );
  return index === -1 ? null : index + 1;
}

export interface CsvProductRow {
  sku: string;
  name: string;
  cost: number | null;
  price: number | null;
  url: string | null;
}

export interface CsvParseResult {
  rows: CsvProductRow[];
  errors: Array<{ line: number; message: string }>;
}

/** One CSV line, honouring double-quoted fields with doubled quotes inside. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      cells.push(cell.trim());
      cell = '';
    } else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

const toAmount = (raw: string | undefined): number | null | undefined => {
  if (raw === undefined || raw === '') return null;
  const value = Number(raw.replace(/[,\s]|EGP|ج\.?م/gi, ''));
  return Number.isFinite(value) && value >= 0 ? value : undefined;
};

export const MAX_IMPORT_ROWS = 500;

/**
 * A seller's product list: a header row naming sku and name (cost, price and
 * url optional, any order, English or Arabic names), then one product per line.
 * Bad lines are reported, not guessed at.
 */
export function parseProductsCsv(text: string): CsvParseResult {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? '').map((h) => h.toLowerCase());
  const column = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const at = {
    sku: column('sku', 'كود', 'الكود'),
    name: column('name', 'title', 'الاسم', 'اسم المنتج'),
    cost: column('cost', 'cost price', 'التكلفة'),
    price: column('price', 'selling price', 'السعر', 'سعر البيع'),
    url: column('url', 'link', 'الرابط'),
  };
  const errors: CsvParseResult['errors'] = [];
  if (at.sku === -1 || at.name === -1) {
    return { rows: [], errors: [{ line: 1, message: 'The first row must name the columns, with at least "sku" and "name"' }] };
  }

  const rows: CsvProductRow[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const line = i + 1;
    if (rows.length >= MAX_IMPORT_ROWS) {
      errors.push({ line, message: `Only the first ${MAX_IMPORT_ROWS} products are imported at once` });
      break;
    }
    const cells = splitCsvLine(lines[i]);
    const sku = cells[at.sku]?.slice(0, 128) ?? '';
    const name = cells[at.name]?.slice(0, 255) ?? '';
    if (!sku || !name) {
      errors.push({ line, message: 'Missing sku or name' });
      continue;
    }
    if (seen.has(sku)) {
      errors.push({ line, message: `SKU ${sku} appears twice` });
      continue;
    }
    const cost = at.cost === -1 ? null : toAmount(cells[at.cost]);
    const price = at.price === -1 ? null : toAmount(cells[at.price]);
    if (cost === undefined || price === undefined) {
      errors.push({ line, message: 'Cost and price must be numbers' });
      continue;
    }
    const rawUrl = at.url === -1 ? '' : (cells[at.url] ?? '');
    if (rawUrl && listingKey(rawUrl) === null) {
      errors.push({ line, message: 'The link is not a valid URL' });
      continue;
    }
    seen.add(sku);
    rows.push({ sku, name, cost, price, url: rawUrl || null });
  }
  return { rows, errors };
}

/** Repricer suggestions as CSV, for upload to a seller centre by hand. */
export function suggestionsCsv(
  rows: Array<{ sku: string; name: string; currentPrice: number | null; suggestedPrice: number | null; reason: string }>,
): string {
  const quote = (value: string | number | null) => {
    const text = value === null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return ['sku,name,current_price,suggested_price,reason', ...rows.map((r) => [r.sku, r.name, r.currentPrice, r.suggestedPrice, r.reason].map(quote).join(','))].join('\n');
}
