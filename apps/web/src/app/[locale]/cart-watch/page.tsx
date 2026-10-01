'use client';

import { useState } from 'react';
import { ShoppingBasket, Trash2 } from 'lucide-react';
import { UpgradePrompt } from '@/components/billing/upgrade-prompt';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/state';
import { useEntitlement } from '@/lib/hooks/use-billing';
import { useCarts, useDeleteCart, useUpdateCart } from '@/lib/hooks/use-buyer';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { productTitle } from '@/lib/product-title';
import type { CartWatch } from '@/types/buyer.types';
import { SignedInGate } from '../account/signed-in-gate';

/** Baskets: several products, one target total, one alert when it gets there. */
export default function CartWatchPage() {
  const { t } = useI18n();
  return (
    <SignedInGate path="/cart-watch" prompt={t.baskets.signIn}>
      <Baskets />
    </SignedInGate>
  );
}

function Baskets() {
  const { t } = useI18n();
  const access = useEntitlement('cart_watch');
  const { data, isLoading } = useCarts(access === 'available');

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-fg">
          <ShoppingBasket className="h-5 w-5 text-brand" aria-hidden />
          {t.baskets.title}
        </h1>
        <p className="text-sm text-muted">{t.baskets.lede}</p>
      </header>
      {access === 'loading' || (access === 'available' && isLoading) ? (
        <Skeleton className="h-48 w-full" />
      ) : access === 'hidden' ? (
        <EmptyState title={t.baskets.unavailable} />
      ) : access === 'locked' ? (
        <UpgradePrompt title={t.baskets.lockedTitle} description={t.baskets.lockedBody} />
      ) : !data || data.length === 0 ? (
        <EmptyState title={t.baskets.emptyTitle} description={t.baskets.emptyBody} />
      ) : (
        data.map((cart) => <BasketCard key={cart.id} cart={cart} />)
      )}
    </div>
  );
}

function BasketCard({ cart }: { cart: CartWatch }) {
  const { t, tf, fmt, locale } = useI18n();
  const update = useUpdateCart();
  const remove = useDeleteCart();
  const [target, setTarget] = useState(String(cart.targetTotal));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-fg" dir="auto">
            {cart.name}
          </h2>
          {cart.reached ? <Badge variant="success">{t.baskets.reached}</Badge> : !cart.isActive && <Badge variant="neutral">{t.baskets.paused}</Badge>}
        </div>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <p className="text-2xl font-semibold tabular-nums text-fg">
          {cart.total === null ? '—' : fmt.currency(cart.total, 'EGP')}
          <span className="ms-2 text-sm font-normal text-muted">
            {tf(t.baskets.target, { target: fmt.currency(cart.targetTotal, 'EGP') })}
            {cart.store ? ` · ${tf(t.baskets.allFrom, { store: cart.store })}` : ''}
          </span>
        </p>
        <ul className="flex flex-col divide-y divide-border">
          {cart.items.map((item) => (
            <li key={item.product.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link href={`/products/${item.product.slug}`} className="min-w-0 flex-1 truncate text-sm text-fg hover:text-brand">
                {item.qty > 1 ? `${item.qty} × ` : ''}
                {productTitle(item.product, locale)}
              </Link>
              <span className="text-xs text-muted">
                {item.price === null ? t.baskets.noPrice : `${fmt.currency(item.price, 'EGP')}${item.store ? ` · ${item.store}` : ''}`}
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t.baskets.removeItem}
                disabled={cart.items.length === 1}
                onClick={() =>
                  update.mutate({
                    id: cart.id,
                    items: cart.items.filter((i) => i.product.id !== item.product.id).map((i) => ({ productId: i.product.id, qty: i.qty })),
                  })
                }
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input label={t.baskets.targetLabel} inputMode="numeric" dir="ltr" value={target} onChange={(e) => setTarget(e.target.value)} wrapperClassName="flex-1" />
          <Button variant="secondary" loading={update.isPending} onClick={() => update.mutate({ id: cart.id, targetTotal: Number(target) || cart.targetTotal })}>
            {t.baskets.saveTarget}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Checkbox
            label={t.baskets.oneStore}
            checked={!cart.acrossStores}
            onChange={(e) => update.mutate({ id: cart.id, acrossStores: !e.target.checked })}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: cart.id, isActive: !cart.isActive })}>
              {cart.isActive ? t.baskets.pause : t.baskets.resume}
            </Button>
            <Button size="sm" variant="ghost" loading={remove.isPending} onClick={() => remove.mutate(cart.id)}>
              {t.baskets.delete}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
