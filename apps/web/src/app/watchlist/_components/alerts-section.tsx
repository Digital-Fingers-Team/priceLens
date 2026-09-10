'use client';
import Link from 'next/link';
import { Bell, BellRing, Trash2 } from 'lucide-react';
import { useAlerts, useDeleteAlert } from '@/lib/hooks/use-watchlist';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatRelativeTime } from '@/lib/utils/format';
import type { AlertType, PriceAlert } from '@/types/product.types';

function describeAlert(alertType: AlertType, threshold: number): string {
  switch (alertType) {
    case 'PRICE_TARGET':
      return `Notify below ${formatCurrency(threshold)}`;
    case 'PRICE_DROP_ABSOLUTE':
      return `Notify on a ${formatCurrency(threshold)} drop`;
    case 'PRICE_DROP_PERCENT':
      return `Notify on a ${threshold}% drop`;
    default:
      return `Threshold ${formatCurrency(threshold)}`;
  }
}

export function AlertsSection() {
  const { data: alerts, isLoading } = useAlerts();
  const { mutate: deleteAlert } = useDeleteAlert();

  if (isLoading) {
    return <Skeleton className="h-24 rounded-xl" />;
  }

  // Nothing set up yet — the watchlist below already explains how to add one,
  // so stay out of the way rather than showing an empty shell.
  if (!alerts || alerts.length === 0) return null;

  // Fired alerts are the whole point of the feature, so they come first.
  const triggered = alerts.filter((alert) => alert.status === 'TRIGGERED');
  const pending = alerts.filter((alert) => alert.status !== 'TRIGGERED');
  const ordered: PriceAlert[] = [...triggered, ...pending];

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <Bell className="w-5 h-5 text-amber" />
        <h2 className="text-lg font-semibold text-ink-100">Price Alerts</h2>
        {triggered.length > 0 && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-signal/15 text-signal">
            {triggered.length} triggered
          </span>
        )}
      </div>

      <div className="space-y-2">
        {ordered.map((alert) => {
          const isTriggered = alert.status === 'TRIGGERED';

          return (
            <div
              key={alert.id}
              className={`rounded-xl border p-4 flex items-center gap-4 group transition-colors ${
                isTriggered
                  ? 'border-signal/40 bg-signal/5'
                  : 'border-ink-700 bg-ink-900 hover:border-ink-500'
              }`}
            >
              <div className="shrink-0">
                {isTriggered ? (
                  <BellRing className="w-5 h-5 text-signal" />
                ) : (
                  <Bell className="w-5 h-5 text-ink-600" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <Link href={`/products/${alert.canonicalProduct.slug}`}>
                  <h3 className="font-semibold text-ink-100 text-sm line-clamp-1 hover:text-signal transition-colors">
                    {alert.canonicalProduct.title}
                  </h3>
                </Link>

                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {isTriggered && alert.triggeredPrice != null ? (
                    <span className="text-signal font-bold text-sm">
                      Hit {formatCurrency(Number(alert.triggeredPrice))}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-400">
                      {describeAlert(alert.alertType, Number(alert.thresholdValue))}
                    </span>
                  )}

                  {isTriggered && alert.triggeredAt && (
                    <span className="text-xs text-ink-500">
                      {formatRelativeTime(alert.triggeredAt)}
                    </span>
                  )}

                  {!isTriggered && (
                    <span className="text-xs text-ink-600">
                      {alert.lastCheckedAt
                        ? `Checked ${formatRelativeTime(alert.lastCheckedAt)}`
                        : 'Not checked yet'}
                    </span>
                  )}
                </div>
              </div>

              <div className="shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="xs"
                  leftIcon={<Trash2 className="w-3.5 h-3.5 text-red-400" />}
                  onClick={() => deleteAlert(alert.id)}
                  aria-label={`Delete alert for ${alert.canonicalProduct.title}`}
                >
                  Delete
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
