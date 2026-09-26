'use client';

import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import type { PositionLabel } from '@/types/seller.types';

/** One consistent reading of market position everywhere it appears. */
const VARIANT: Record<PositionLabel, BadgeVariant> = {
  CHEAPEST: 'success',
  BELOW_MARKET: 'success',
  AT_MARKET: 'info',
  ABOVE_MARKET: 'warning',
  MOST_EXPENSIVE: 'danger',
  INSUFFICIENT_DATA: 'outline',
};

export function PositionBadge({ label }: { label: PositionLabel }) {
  const { t } = useI18n();
  return <Badge variant={VARIANT[label]}>{t.seller.positions[label]}</Badge>;
}
