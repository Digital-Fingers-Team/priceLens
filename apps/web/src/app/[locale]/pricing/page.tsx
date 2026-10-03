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
import { planWords } from '@/lib/billing/plan-words';

type Fmt = ReturnType<typeof useI18n>;

/** Where "Contact sales" goes (owner decision D-26). */
const SALES_EMAIL = 'Baraasaad006@gmail.com';

/**
 * Plain-language summary of a plan, driven by the API's values. Each paid tier lists only what it
 * adds, led by an "everything in <lower plan>" line, so the ladder between plans reads at a glance.
 */
function planHighlights(plan: Plan, { t, tf, tp, fmt }: Fmt): string[] {
  const { limits } = plan;
  const h: Dictionary['pricing']['highlights'] = t.pricing.highlights;
  const has = (feature: string) => limits.features.includes(feature as (typeof limits.features)[number]);
  const lines: string[] = [];

  const tierBelow = has('api_access') ? h.inheritsSellerPlus : has('import_finder') ? h.inheritsSeller : has('seller_workspace') ? h.inheritsPlus : has('buy_verdict') ? h.inheritsFree : null;
  if (tierBelow) lines.push(tierBelow);

  // Limits: the free tier's are the headline; Plus raises them; the seller tiers re-state only what changes.
  if (!has('seller_workspace')) {
    lines.push(
      limits.trackedProducts === null ? h.unlimitedProducts : tp(h.products, limits.trackedProducts),
      limits.activeAlerts === null ? h.unlimitedAlerts : tp(h.alerts, limits.activeAlerts),
      limits.priceHistoryDays === null ? h.fullHistory : tf(h.historyDays, { days: limits.priceHistoryDays }),
      tp(h.alertTypes, limits.alertTypes.length),
    );
  }

  const add = (feature: string, line: string) => {
    if (has(feature)) lines.push(line);
  };

  if (has('buy_verdict') && !has('seller_workspace')) {
    add('buy_verdict', h.buyVerdict);
    add('fake_sale_detection', h.fakeDiscount);
    add('advanced_deal_score', h.advancedScore);
    add('restock_alerts', h.restock);
    if (limits.notificationChannels.includes('TELEGRAM')) lines.push(h.telegram);
    add('landed_cost_detail', h.landedCost);
    add('installment_comparison', h.installments);
    add('card_offers', h.cardOffers);
    add('verified_coupons', h.coupons);
    add('cart_watch', h.cartWatch);
    add('image_search', h.imageSearch);
    add('advisor', h.advisor);
    add('ad_free', h.adFree);
  }

  if (has('seller_workspace') && !has('import_finder')) {
    add('competitor_monitoring', h.competitors);
    add('competitor_alerts', h.competitorAlerts);
    add('profit_calculator', h.profit);
    add('best_platform', h.bestPlatform);
    add('margin_pricing', h.margin);
    add('repricer_suggest', h.repricer);
    add('rank_tracking', h.rankTracking);
  }

  if (has('import_finder') && !has('api_access')) {
    add('import_finder', h.importFinder);
    add('trend_radar', h.trendRadar);
    add('fx_tracking', h.fxTracking);
  }

  if (has('api_access')) {
    add('map_monitoring', h.map);
    add('distribution_monitoring', h.distribution);
    add('launch_detection', h.launches);
    add('market_reports', h.reports);
    add('procurement_quotes', h.quotes);
    lines.push(tf(h.api, { calls: fmt.number(limits.apiCallsPerDay) }));
  }

  if (limits.monitoredSkus) lines.push(tf(h.skus, { count: fmt.number(limits.monitoredSkus) }));
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
  // Shoppers' plans, then sellers' and businesses': two rows that each read
  // as a ladder, instead of one grid that left the last plan on its own.
  const isSellerPlan = (plan: Plan) => plan.limits.features.includes('seller_workspace' as (typeof plan.limits.features)[number]);
  const groups = [
    { key: 'shoppers', title: t.pricing.forShoppers, lede: t.pricing.forShoppersLede, plans: data?.plans.filter((plan) => !isSellerPlan(plan)) ?? [] },
    { key: 'sellers', title: t.pricing.forSellers, lede: t.pricing.forSellersLede, plans: data?.plans.filter(isSellerPlan) ?? [] },
  ].filter((group) => group.plans.length > 0);

  return (
    <div className="mx-auto flex max-w-page flex-col gap-10 px-4 py-12 sm:px-6">
      <header className="flex max-w-2xl flex-col gap-2">
        <p className="label-mono text-brand-text">{t.nav.pricing}</p>
        <h1 className="text-3xl font-semibold text-fg">{t.pricing.title}</h1>
        <p className="text-base text-muted">{t.pricing.lede}</p>
      </header>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((key) => (
            <Skeleton key={key} className="h-96" />
          ))}
        </div>
      ) : !data || data.plans.length === 0 ? (
        <EmptyState title={t.pricing.unavailable} />
      ) : (
        <>
          <div className="flex flex-col gap-12">
            {groups.map((group) => (
              <section key={group.key} aria-labelledby={`plans-${group.key}`} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h2 id={`plans-${group.key}`} className="text-xl font-semibold text-fg">
                    {group.title}
                  </h2>
                  <p className="text-sm text-muted">{group.lede}</p>
                </div>
                <div className={cn('grid gap-4', group.plans.length > 2 ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2')}>
                  {group.plans.map((plan) => {
                    const isCurrent = billing?.planKey === plan.key;
                    const featured = plan.tier === 'PLUS';
                    // Worded by the dictionary per tier; the API's English for anything else.
                    const words = planWords(t, plan);
                    return (
                      <div
                        key={plan.id}
                        className={cn(
                          'flex flex-col gap-4 rounded-md border bg-surface p-6',
                          featured ? 'border-2 border-brand shadow' : 'border-border',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-lg font-semibold text-fg">{words.name}</h3>
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
                          <span className="text-3xl font-semibold tabular-nums text-fg">
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
                              <Check className="mt-1 h-4 w-4 shrink-0 text-brand-text" aria-hidden />
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
                                // No Stripe: pay online (Paymob) or by wallet / InstaPay on the pay page.
                                if (!data.checkoutEnabled && (data.manualPaymentsEnabled || data.onlineProviders?.length)) {
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
              </section>
            ))}
          </div>
          {!data.checkoutEnabled && !data.manualPaymentsEnabled && !data.onlineProviders?.length && <p className="text-center text-xs text-muted">{t.pricing.checkoutDisabled}</p>}
        </>
      )}
    </div>
  );
}
