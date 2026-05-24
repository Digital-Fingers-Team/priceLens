import type { PriceStats } from '@/types/product.types';

export function getPriceRange(stats: PriceStats | null | undefined): {
  min: number | null;
  max: number | null;
  hasRange: boolean;
  spread: number | null;
  spreadPercent: number | null;
} {
  if (!stats) {
    return { min: null, max: null, hasRange: false, spread: null, spreadPercent: null };
  }

  const { min, max } = stats;
  const hasRange = min != null && max != null && min !== max;
  const spread = hasRange ? (max! - min!) : null;
  const spreadPercent = hasRange && min! > 0 ? ((max! - min!) / min!) * 100 : null;

  return { min, max, hasRange, spread, spreadPercent };
}

export function getPriceDeltaVsAvg(
  currentPrice: number | null,
  avgPrice: number | null,
): { delta: number | null; deltaPercent: number | null; isBelow: boolean } {
  if (currentPrice == null || avgPrice == null || avgPrice === 0) {
    return { delta: null, deltaPercent: null, isBelow: false };
  }

  const delta = currentPrice - avgPrice;
  const deltaPercent = (delta / avgPrice) * 100;
  return { delta, deltaPercent, isBelow: delta < 0 };
}

export function getConfidenceLevel(
  confidence: number | null | undefined,
): 'high' | 'medium' | 'low' | 'unknown' {
  if (confidence == null) return 'unknown';
  if (confidence >= 0.88) return 'high';
  if (confidence >= 0.60) return 'medium';
  return 'low';
}

export function getConfidenceColor(level: ReturnType<typeof getConfidenceLevel>): string {
  switch (level) {
    case 'high':    return 'text-emerald-400';
    case 'medium':  return 'text-amber-400';
    case 'low':     return 'text-red-400';
    default:        return 'text-ink-400';
  }
}

export function getConfidenceLabel(level: ReturnType<typeof getConfidenceLevel>): string {
  switch (level) {
    case 'high':    return 'High confidence match';
    case 'medium':  return 'Medium confidence — review suggested';
    case 'low':     return 'Low confidence match';
    default:        return 'Confidence unknown';
  }
}

export function isBestDeal(
  price: number,
  allPrices: number[],
): boolean {
  if (allPrices.length === 0) return false;
  return price === Math.min(...allPrices);
}