'use client';

import { Recycle } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/card';
import { useUsedPrice } from '@/lib/hooks/use-intelligence';
import { useI18n } from '@/lib/i18n/provider';

/** "Used, typically X–Y": a range from classifieds, never individual listings. */
export function UsedPriceCard({ productId, newPrice }: { productId: string; newPrice: number | null }) {
  const { t, tf, fmt } = useI18n();
  const { data } = useUsedPrice(productId);
  if (!data) return null;

  const saving = newPrice && newPrice > data.median ? Math.round(((newPrice - data.median) / newPrice) * 100) : null;
  return (
    <Card>
      <CardBody className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Recycle className="h-4 w-4 text-brand-text" aria-hidden />
          {tf(t.used.title, { from: fmt.currency(data.p25, 'EGP'), to: fmt.currency(data.p75, 'EGP') })}
        </p>
        <p className="text-xs text-muted">
          {tf(t.used.basis, { count: data.sampleSize, when: fmt.date(data.capturedAt) })}
          {saving ? ` · ${tf(t.used.saving, { pct: saving })}` : ''}
        </p>
        <p className="text-xs text-muted">
          {t.used.note}{' '}
          {data.searchUrl && (
            <a href={data.searchUrl} target="_blank" rel="nofollow noopener noreferrer" className="text-brand-text underline">
              {t.used.see}
            </a>
          )}
        </p>
      </CardBody>
    </Card>
  );
}
