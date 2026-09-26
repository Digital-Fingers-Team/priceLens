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

/**
 * Offers that deserve the "Best Deal" badge: the lowest base-currency price
 * among offers not reported sold out. Every offer at that price gets it,
 * since they are all equally the lowest. Comparing on price alone used to
 * crown a sold-out offer (audit 02, L-20). Unknown stock (most stores never
 * publish it) still qualifies, matching the API's live-offer rule.
 */
export function bestDealIds(
  offers: ReadonlyArray<{ id: string; priceUsd: number | null; inStock: boolean | null }>,
): Set<string> {
  const buyable = offers.filter(
    (offer): offer is typeof offer & { priceUsd: number } =>
      offer.priceUsd != null && offer.priceUsd > 0 && offer.inStock !== false,
  );
  if (buyable.length === 0) return new Set();
  const lowest = Math.min(...buyable.map((offer) => offer.priceUsd));
  return new Set(buyable.filter((offer) => offer.priceUsd === lowest).map((offer) => offer.id));
}