export type VerdictCode = 'GOOD_TIME_TO_BUY' | 'FAIR_PRICE' | 'WAIT' | 'INSUFFICIENT_DATA';
export type ConfidenceCode = 'HIGH' | 'MEDIUM' | 'LOW';
export type DiscountVerdict = 'GENUINE' | 'SUSPICIOUS' | 'UNVERIFIABLE' | 'NO_DISCOUNT_CLAIMED';

export interface BuyVerdict {
  verdict: VerdictCode;
  confidence: ConfidenceCode | null;
  percentile: number | null;
  vsAverage: number | null;
  aboveLow: number | null;
  /** English sentences (API clients). */
  reasons: string[];
  /** The same reasons as codes, worded by the dictionary (audit 11). */
  reasonCodes?: VerdictReason[];
  missing?: { dayCount: number; spanDays: number; needDays: number; needSpanDays: number };
}

export type VerdictReasonCode =
  | 'NO_HISTORY'
  | 'TOO_LITTLE_HISTORY'
  | 'CHEAPER_THAN_PCT'
  | 'AT_LOWEST'
  | 'WITHIN_PCT_OF_LOW'
  | 'PRICIER_THAN_PCT'
  | 'LOW_IN_PERIOD'
  | 'TYPICAL_PRICE'
  | 'ABOVE_LOW_PCT'
  | 'BELOW_AVERAGE_PCT'
  | 'ABOVE_AVERAGE_PCT'
  | 'VOLATILE';

export interface VerdictReason {
  code: VerdictReasonCode;
  params: Partial<Record<'pct' | 'days' | 'span' | 'needDays' | 'needSpan' | 'price', number>>;
}

export interface DealSignal {
  key: string;
  label: string;
  weight: number;
  score: number | null;
  detail: string;
  available: boolean;
}

export interface DealScore {
  score: number | null;
  grade: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | null;
  coverage: number;
  signals: DealSignal[];
  methodology: string;
}

export interface DiscountCheck {
  verdict: DiscountVerdict;
  advertisedWas: number | null;
  currentPrice: number | null;
  claimedDiscountPct: number | null;
  realDiscountPct: number | null;
  observedTypicalPrice: number | null;
  explanation: string;
}

export interface CurrentMarket {
  best: number | null;
  median: number | null;
  average: number | null;
  highest: number | null;
  storeCount: number;
  inStock: boolean | null;
  currency: string;
  bestStore: { platformId: string; name: string; url: string } | null;
}

export interface DailyPricePoint {
  date: string;
  min: number;
  max: number;
  avg: number;
  count: number;
  inStock: boolean;
}

export interface HistoryStats {
  low: number;
  high: number;
  average: number;
  median: number;
  stdDev: number;
  volatility: number;
  dayCount: number;
  spanDays: number;
  firstDate: string;
  lastDate: string;
  points: DailyPricePoint[];
}

export interface ProductIntelligence {
  productId: string;
  currency: string;
  window: { days: number; truncated: boolean; maxDays: number | null };
  market: CurrentMarket;
  history: HistoryStats | null;
  verdict: BuyVerdict;
  dealScore: DealScore;
  discountCheck: DiscountCheck;
  insufficientData: boolean;
}
