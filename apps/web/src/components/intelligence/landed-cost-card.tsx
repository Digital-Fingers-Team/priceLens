'use client';

import { Globe } from 'lucide-react';
import { UpgradePrompt } from '@/components/billing/upgrade-prompt';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { useFlags } from '@/lib/hooks/use-billing';
import { useLandedCost } from '@/lib/hooks/use-intelligence';
import { useI18n } from '@/lib/i18n/provider';

/**
 * What an AliExpress / eBay offer really costs once it reaches Egypt, next to
 * the cheapest local price. Always labelled an estimate, with the rates used.
 * Renders nothing for a product only sold locally.
 */
export function LandedCostCard({ productId }: { productId: string }) {
  const { t, tf, fmt } = useI18n();
  const { data } = useLandedCost(productId);
  const flags = useFlags();

  if (!data || data.offers.length === 0) return null;
  const local = data.cheapestLocal;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Globe className="h-4 w-4 text-brand-text" aria-hidden />
            {t.landed.title}
          </h3>
          <p className="text-xs text-muted">{t.landed.lede}</p>
        </div>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <ul className="flex flex-col divide-y divide-border">
          {data.offers.map((offer) => {
            const cheaperLocally = local !== null && local.price < offer.total;
            return (
              <li key={offer.listingId} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-fg">{offer.store}</span>
                  <span className="text-lg font-semibold tabular-nums text-fg">≈ {fmt.currency(offer.total, data.currency)}</span>
                </div>
                <p className="text-xs text-muted">
                  {tf(t.landed.listed, { price: fmt.currency(offer.price, data.currency) })}
                  {' · '}
                  {tf(t.landed.assumptions, { customs: offer.assumptions.customsPct, vat: offer.assumptions.vatPct })}
                  {offer.assumptions.shipping === 'included' ? ` · ${t.landed.shippingIncluded}` : ''}
                  {offer.deliveryDays ? ` · ${tf(t.landed.days, { days: offer.deliveryDays })}` : ''}
                </p>
                {offer.breakdown && (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded bg-surface-2 p-3 text-xs sm:grid-cols-5">
                    {(
                      [
                        [t.landed.price, offer.breakdown.price],
                        [t.landed.shipping, offer.breakdown.shipping],
                        [t.landed.customs, offer.breakdown.customs],
                        [t.landed.vat, offer.breakdown.vat],
                        [t.landed.handling, offer.breakdown.handling],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label} className="flex flex-col">
                        <dt className="text-muted">{label}</dt>
                        <dd className="tabular-nums text-fg">{fmt.currency(value, data.currency)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {local && (
                  <p className={cheaperLocally ? 'w-fit rounded-sm bg-accent px-2 py-1 text-xs font-medium text-accent-fg' : 'text-xs text-success'}>
                    {cheaperLocally
                      ? tf(t.landed.localCheaper, { store: local.store, price: fmt.currency(local.price, data.currency) })
                      : tf(t.landed.importCheaper, { store: local.store, price: fmt.currency(local.price, data.currency) })}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        {!data.detail && flags.isOn('landed_cost_detail') && (
          <UpgradePrompt compact title={t.landed.upgrade} />
        )}
        <p className="text-xs text-muted">{t.landed.disclaimer}</p>
      </CardBody>
    </Card>
  );
}
