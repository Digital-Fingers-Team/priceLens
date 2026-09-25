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