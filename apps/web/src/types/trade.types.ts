export interface TradeProduct {
  id: string;
  slug: string;
  title: string;
  titleAr: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
}

export interface CategoryRef {
  id: string;
  slug: string;
  name: string;
}

export interface ImportOpportunity {
  product: TradeProduct;
  category: CategoryRef;
  importStore: { slug: string; name: string };
  importPrice: number;
  landedCost: number;
  localLowest: number;
  localMedian: number;
  localStores: number;
  marginEgp: number;
  marginPct: number;
  volatilityPct: number | null;
  interest: number;
  demandScore: number;
  score: number;
  checkMatch: boolean;
}

export interface ImportOpportunities {
  currency: string;
  total: number;
  computedAt: string | null;
  categories: Array<CategoryRef & { count: number }>;
  items: ImportOpportunity[];
}

export type FxSource = 'CBE' | 'MARKET';

export interface FxLatest {
  base: string;
  rates: Array<{
    source: FxSource;
    currency: string;
    buy: number | null;
    sell: number | null;
    mid: number;
    rateDate: string;
    changePct: number | null;
  }>;
}

export interface FxHistory {
  currency: string;
  base: string;
  points: Array<{ day: string; cbe: number | null; cbeBuy: number | null; cbeSell: number | null; market: number | null }>;
}

export interface FxScenario {
  rate: number;
  changePct: number;
  landedCost: number;
  marginEgp: number | null;
  marginPct: number | null;
}

export interface FxImpact {
  usd: { rate: number; source: FxSource | 'INGESTION' } | null;
  rateMonthAgo: number | null;
  steps: number[];
  tracked: number;
  items: Array<{
    product: TradeProduct;
    importStore: string;
    importPrice: number;
    landedCost: number;
    localLowest: number | null;
    localStore: string | null;
    landedMonthAgo: number | null;
    scenarios: FxScenario[];
    breakEvenRate: number | null;
  }>;
}

export interface TrendEntry {
  category: CategoryRef | null;
  priceChangePct: number | null;
  supply: number;
  supplyBefore: number;
  interest: number;
  interestBefore: number;
  metrics: Record<string, number | null>;
  score: number;
}

export interface TrendRadar {
  weekStart: string | null;
  weekEnd?: string;
  weeks: string[];
  categories: TrendEntry[];
  products: Array<TrendEntry & { product: TradeProduct | null }>;
}
