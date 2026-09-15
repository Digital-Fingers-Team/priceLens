'use client';

import { Check, Minus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCheckout, useMyBilling, usePlans } from '@/lib/hooks/use-billing';
import { useAuthStore } from '@/lib/store/auth.store';
import { cn } from '@/lib/utils/cn';
import type { Plan } from '@/types/billing.types';

/** Plain-language summary of a plan's limits, driven by the API's values. */
function planHighlights(plan: Plan): string[] {
  const { limits } = plan;
  const unlimited = (value: number | null, noun: string) =>
    value === null ? `Unlimited ${noun}` : `${value.toLocaleString()} ${noun}`;

  const lines = [
    unlimited(limits.trackedProducts, 'tracked products'),
    unlimited(limits.activeAlerts, 'active price alerts'),
    limits.priceHistoryDays === null
      ? 'Full price history'
      : `${limits.priceHistoryDays} days of price history`,
    `${limits.alertTypes.length} alert type${limits.alertTypes.length === 1 ? '' : 's'}`,
  ];

  if (limits.features.includes('buy_verdict')) lines.push('Buy / Wait verdict');
  if (limits.features.includes('fake_sale_detection')) lines.push('Fake-discount detection');
  if (limits.features.includes('advanced_deal_score')) lines.push('Advanced deal score');
  if (limits.features.includes('restock_alerts')) lines.push('Restock alerts');
  if (limits.notificationChannels.includes('TELEGRAM')) lines.push('Telegram + email delivery');
  if (limits.features.includes('competitor_monitoring')) lines.push('Competitor price monitoring');
  if (limits.features.includes('margin_pricing')) lines.push('Margin-aware pricing advice');
  if (limits.monitoredSkus) lines.push(`${limits.monitoredSkus.toLocaleString()} monitored SKUs`);
  if (limits.features.includes('map_monitoring')) lines.push('MAP violation monitoring');
  if (limits.features.includes('api_access')) lines.push(`API access (${limits.apiCallsPerDay.toLocaleString()}/day)`);
  if (limits.seats > 1) lines.push(`${limits.seats} team seats`);

  return lines;
}

export default function PricingPage() {
  const { data, isLoading } = usePlans();
  const { data: billing } = useMyBilling();
  const { mutate: checkout, isPending, variables } = useCheckout();
  const isAuthenticated = useAuthStore((s) => Boolean(s.user));
  const router = useRouter();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight text-ink-50 sm:text-4xl">
          PriceLens watches the market for you
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-400">
          Every plan is built on the same thing: prices we record ourselves, every day, across every
          store we track. Nothing here is estimated.
        </p>
      </header>

      {isLoading ? (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-96 rounded-2xl" />
          ))}
        </div>
      ) : !data || data.plans.length === 0 ? (
        <p className="mt-10 text-center text-sm text-ink-500">
          Plans are not available right now. Please try again shortly.
        </p>
      ) : (
        <>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.plans.map((plan) => {
              const isCurrent = billing?.planKey === plan.key;
              const featured = plan.tier === 'PLUS';

              return (
                <div
                  key={plan.id}
                  className={cn(
                    'flex flex-col rounded-2xl border p-6',
                    featured ? 'border-signal/40 bg-signal/[0.04]' : 'border-ink-700 bg-ink-900',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-ink-50">{plan.name}</h2>
                    {isCurrent ? (
                      <Badge variant="success">Current plan</Badge>
                    ) : featured ? (
                      <Badge variant="premium">Most popular</Badge>
                    ) : null}
                  </div>

                  <p className="mt-2 min-h-[2.5rem] text-sm leading-relaxed text-ink-400">
                    {plan.description}
                  </p>

                  <p className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold tabular-nums text-ink-50">
                      {plan.priceMinor === 0 ? 'Free' : plan.price.toLocaleString()}
                    </span>
                    {plan.priceMinor > 0 && (
                      <span className="text-sm text-ink-500">
                        {plan.currency} / {plan.intervalDays} days
                      </span>
                    )}
                  </p>

                  {plan.trialDays > 0 && !isCurrent && (
                    <p className="mt-1 text-xs text-emerald-400">{plan.trialDays}-day free trial</p>
                  )}

                  <ul className="mt-5 flex-1 space-y-2">
                    {planHighlights(plan).map((line) => (
                      <li key={line} className="flex items-start gap-2 text-sm text-ink-300">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6">
                    {isCurrent ? (
                      <Button variant="ghost" className="w-full" onClick={() => router.push('/account/billing')}>
                        Manage plan
                      </Button>
                    ) : plan.priceMinor === 0 ? (
                      <Button variant="ghost" className="w-full" disabled>
                        Included by default
                      </Button>
                    ) : !plan.purchasable ? (
                      // Enterprise, or a plan an operator has not wired to a
                      // Stripe price yet. Say so rather than showing a button
                      // that would fail.
                      <Button
                        variant="ghost"
                        className="w-full"
                        onClick={() => router.push('/contact?plan=' + plan.key)}
                      >
                        Contact sales
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        loading={isPending && variables === plan.key}
                        onClick={() => {
                          if (!isAuthenticated) {
                            router.push(`/login?next=${encodeURIComponent('/pricing')}`);
                            return;
                          }
                          checkout(plan.key);
                        }}
                      >
                        {isAuthenticated ? `Choose ${plan.name}` : 'Sign in to subscribe'}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!data.checkoutEnabled && (
            <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-ink-500">
              <Minus className="h-3 w-3" aria-hidden />
              Online payment is not enabled on this deployment yet — contact us to activate a plan.
            </p>
          )}
        </>
      )}
    </div>
  );
}
