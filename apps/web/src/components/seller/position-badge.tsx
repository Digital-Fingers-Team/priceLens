'use client';

import { Badge } from '@/components/ui/badge';
import type { PositionLabel } from '@/types/seller.types';

/** One consistent reading of market position everywhere it appears. */
const PRESENTATION: Record<PositionLabel, { label: string; variant: 'success' | 'info' | 'warning' | 'danger' | 'outline' }> = {
  CHEAPEST: { label: 'Cheapest', variant: 'success' },
  BELOW_MARKET: { label: 'Below market', variant: 'success' },
  AT_MARKET: { label: 'At market', variant: 'info' },
  ABOVE_MARKET: { label: 'Above market', variant: 'warning' },
  MOST_EXPENSIVE: { label: 'Most expensive', variant: 'danger' },
  INSUFFICIENT_DATA: { label: 'Not enough data', variant: 'outline' },
};

export function PositionBadge({ label }: { label: PositionLabel }) {
  const presentation = PRESENTATION[label];
  return <Badge variant={presentation.variant}>{presentation.label}</Badge>;
}
