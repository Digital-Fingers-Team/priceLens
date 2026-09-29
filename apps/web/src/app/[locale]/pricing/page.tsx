'use client';

import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buttonClassName } from '@/components/ui/button-styles';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/state';
import { useCheckout, useMyBilling, usePlans } from '@/lib/hooks/use-billing';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { useRouter } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { useAuthStore } from '@/lib/store/auth.store';
import { cn } from '@/lib/utils/cn';
import { loginHref } from '@/lib/utils/next-path';
import type { Plan } from '@/types/billing.types';

type Fmt = ReturnType<typeof useI18n>;

/** Where "Contact sales" goes (owner decision D-26). */
const SALES_EMAIL = 'Baraasaad006@gmail.com';

/** Plain-language summary of a plan's limits, driven by the API's values. */
function planHighlights(plan: Plan, { t, tf, tp, fmt }: Fmt): string[] {
  const { limits } = plan;
  const h: Dictionary['pricing']['highlights'] = t.pricing.highlights;
  const lines = [
    limits.trackedProducts === null ? h.unlimitedProducts : tp(h.products, limits.trackedProducts),
    limits.activeAlerts === null ? h.unlimitedAlerts : tp(h.alerts, limits.activeAlerts),
    limits.priceHistoryDays === null ? h.fullHistory : tf(h.historyDays, { days: limits.priceHistoryDays }),
    tp(h.alertTypes, limits.alertTypes.length),
  ];

  if (limits.features.includes('buy_verdict')) lines.push(h.buyVerdict);
  if (limits.features.includes('fake_sale_detection')) lines.push(h.fakeDiscount);
  if (limits.features.includes('advanced_deal_score')) lines.push(h.advancedScore);
  if (limits.features.includes('restock_alerts')) lines.push(h.restock);
  if (limits.notificationChannels.includes('TELEGRAM')) lines.push(h.telegram);
  if (limits.features.includes('competitor_monitoring')) lines.push(h.competitors);
  if (limits.features.includes('margin_pricing')) lines.push(h.margin);
  if (limits.monitoredSkus) lines.push(tf(h.skus, { count: fmt.number(limits.monitoredSkus) }));
  if (limits.features.includes('map_monitoring')) lines.push(h.map);
  if (limits.features.includes('api_access')) lines.push(tf(h.api, { calls: fmt.number(limits.apiCallsPerDay) }));
  if (limits.seats > 1) lines.push(tf(h.seats, { seats: limits.seats }));
  return lines;
}

export default function PricingPage() {
  const i18n = useI18n();
  const { t, tf, fmt } = i18n;
  const { data, isLoading } = usePlans();
  const { data: billing } = useMyBilling();
  const { mutate: checkout, isPending, variables } = useCheckout();
  const isAuthenticated = useAuthStore((s) => Boolean(s.user));
  const router = useRouter();

  return (
    <div className="mx-auto flex max-w-page flex-col gap-10 px-4 py-12 sm:px-6">
      <header className="flex max-w-2xl flex-col gap-2">
        <p className="label-mono text-brand">{t.nav.pricing}</p>
        <h1 className="text-2xl font-semibold text-fg">{t.pricing.title}</h1>
        <p className="text-base text-muted">{t.pricing.lede}</p>
      </header>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-96" />
          ))}
        </div>
      ) : !data || data.plans.length === 0 ? (
        <EmptyState title={t.pricing.unavailable} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.plans.map((plan) => {
              const isCurrent = billing?.planKey === plan.key;
              const featured = plan.tier === 'PLUS';
              // Worded by the dictionary per tier; the API's English for anything else.
              const words = t.pricing.plans[plan.tier] ?? { name: plan.name, description: plan.description };
              return (
                <div
                  key={plan.id}
                  className={cn(
                    'flex flex-col gap-4 rounded border bg-surface p-6',
                    featured ? 'border-brand' : 'border-border',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-fg">{words.name}</h2>
                    {isCurrent ? (
                      <Badge variant="success">{t.pricing.current}</Badge>
                    ) : featured ? (
                      <Badge variant="brand">{t.pricing.popular}</Badge>
                    ) : null}
                  </div>
                  <p className="min-h-10 text-sm text-muted" dir="auto">
                    {words.description}
                  </p>
                  <p className="flex flex-wrap items-baseline gap-2">
                    <span className="text-2xl font-semibold tabular-nums text-fg">
                      {plan.priceMinor === 0 ? t.pricing.free : fmt.number(plan.price)}
                    </span>
                    {plan.priceMinor > 0 && (
                      <span className="text-sm text-muted">{tf(t.pricing.per, { currency: plan.currency, days: plan.intervalDays })}</span>
                    )}
                  </p>
                  {plan.trialDays > 0 && !isCurrent && (
                    <p className="text-xs text-success">{tf(t.pricing.trial, { days: plan.trialDays })}</p>
                  )}
                  <ul className="flex flex-1 flex-col gap-2 border-t border-border pt-4">
                    {planHighlights(plan, i18n).map((line) => (
                      <li key={line} className="flex items-start gap-2 text-sm text-fg">
                        <Check className="mt-1 h-4 w-4 shrink-0 text-brand" aria-hidden />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                  <div>
                    {isCurrent ? (
                      <Button variant="secondary" className="w-full" onClick={() => router.push('/account/billing')}>
                        {t.pricing.manage}
                      </Button>
                    ) : plan.priceMinor === 0 ? (
                      <Button variant="secondary" className="w-full" disabled>
                        {t.pricing.included}
                      </Button>
                    ) : !plan.purchasable ? (
                      // Enterprise, or a plan that cannot be paid online yet: an email to the owner (D-26; there
                      // is no /contact page).
                      <a
                        href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(`Pricelens ${plan.name}`)}`}
                        className={buttonClassName({ variant: 'secondary', className: 'w-full' })}
                      >
                        {t.pricing.contactSales}
                      </a>
                    ) : (
                      <Button
                        variant={featured ? 'primary' : 'secondary'}
                        className="w-full"
                        loading={isPending && variables === plan.key}
                        onClick={() => {
                          if (!isAuthenticated) {
                            router.push(loginHref('/pricing'));
                            return;
                          }
                          // No card checkout: pay by wallet / InstaPay instead.
                          if (!data.checkoutEnabled && data.manualPaymentsEnabled) {
                            router.push(`/account/pay/${plan.key}`);
                            return;
                          }
                          checkout(plan.key);
                        }}
                      >
                        {isAuthenticated ? tf(t.pricing.choose, { plan: words.name }) : t.pricing.signInToSubscribe}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {!data.checkoutEnabled && !data.manualPaymentsEnabled && <p className="text-center text-xs text-muted">{t.pricing.checkoutDisabled}</p>}
        </>
      )}
    </div>
  );
}
