'use client';
import { productTitle } from '@/lib/product-title';
import { BellRing, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAlerts, useDeleteAlert } from '@/lib/hooks/use-watchlist';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils/cn';
import type { PriceAlert } from '@/types/product.types';

export function AlertsSection() {
  const { t, tf, tp, fmt, locale } = useI18n();
  const { data: alerts, isLoading } = useAlerts();
  const { mutate: deleteAlert } = useDeleteAlert();

  if (isLoading) return <Skeleton className="h-24" />;

  // Nothing set up yet — the watchlist below already explains how to add one,
  // so stay out of the way rather than showing an empty shell.
  if (!alerts || alerts.length === 0) return null;

  // Fired alerts are the whole point of the feature, so they come first.
  const triggered = alerts.filter((alert) => alert.status === 'TRIGGERED');
  const pending = alerts.filter((alert) => alert.status !== 'TRIGGERED');
  const ordered: PriceAlert[] = [...triggered, ...pending];

  function describe(alert: PriceAlert) {
    const threshold = Number(alert.thresholdValue);
    const template = (t.watchlist.alertRule as Record<string, string>)[alert.alertType] ?? t.watchlist.alertRule.default;
    return tf(template, { amount: fmt.currency(threshold), percent: fmt.percent(threshold) });
  }

  return (
    <section aria-labelledby="alerts-heading" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 id="alerts-heading" className="label-mono text-muted">
          {t.watchlist.alertsHeading}
        </h2>
        {triggered.length > 0 && <Badge variant="brand">{tp(t.watchlist.triggered, triggered.length)}</Badge>}
      </div>
      <ul className="divide-y divide-border rounded border border-border bg-surface">
        {ordered.map((alert) => {
          const isTriggered = alert.status === 'TRIGGERED';
          return (
            <li key={alert.id} className={cn('flex items-center gap-4 p-4', isTriggered && 'bg-brand-soft/40')}>
              {isTriggered && <BellRing className="h-4 w-4 shrink-0 text-brand-text" aria-hidden />}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Link href={`/products/${alert.canonicalProduct.slug}`} dir="auto" className="line-clamp-1 text-sm font-medium text-fg hover:text-brand-text">
                  {productTitle(alert.canonicalProduct, locale)}
                </Link>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  {isTriggered && alert.triggeredPrice != null ? (
                    <span className="text-sm font-semibold tabular-nums text-brand-text">
                      {tf(t.watchlist.hit, { price: fmt.currency(Number(alert.triggeredPrice)) })}
                    </span>
                  ) : (
                    <span>{describe(alert)}</span>
                  )}
                  {isTriggered && alert.triggeredAt && <span>{fmt.relative(alert.triggeredAt)}</span>}
                  {!isTriggered && (
                    <span>
                      {alert.lastCheckedAt ? tf(t.product.checked, { when: fmt.relative(alert.lastCheckedAt) }) : t.watchlist.notChecked}
                    </span>
                  )}
                </p>
              </div>
              <IconButton
                size="sm"
                onClick={() => deleteAlert(alert.id)}
                aria-label={tf(t.watchlist.deleteAlert, { title: productTitle(alert.canonicalProduct, locale) })}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
