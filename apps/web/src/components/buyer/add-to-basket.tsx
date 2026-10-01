'use client';

import { useState } from 'react';
import { ShoppingBasket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useEntitlement } from '@/lib/hooks/use-billing';
import { useCarts, useCreateCart, useUpdateCart } from '@/lib/hooks/use-buyer';
import { useRouter } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { useUiStore } from '@/lib/store/ui.store';

const NEW = '__new__';

/** Puts this product in a watched basket: an existing one, or a new one with a target. */
export function AddToBasket({ productId, price }: { productId: string; price: number | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const access = useEntitlement('cart_watch');
  const [open, setOpen] = useState(false);
  const { data: carts } = useCarts(access === 'available' && open);
  const create = useCreateCart();
  const update = useUpdateCart();
  const addToast = useUiStore((s) => s.addToast);
  const [choice, setChoice] = useState(NEW);
  const [name, setName] = useState('');
  const [target, setTarget] = useState(price ? String(Math.round(price * 0.9)) : '');

  if (access === 'hidden' || access === 'loading') return null;

  const done = () => {
    setOpen(false);
    addToast(t.baskets.added, 'success');
  };

  const submit = () => {
    if (choice === NEW) {
      create.mutate({ name: name || t.baskets.defaultName, targetTotal: Number(target) || 1, items: [{ productId }] }, { onSuccess: done });
      return;
    }
    const cart = carts?.find((c) => c.id === choice);
    if (!cart) return;
    const items = [...cart.items.map((i) => ({ productId: i.product.id, qty: i.qty })), { productId }];
    update.mutate({ id: cart.id, items }, { onSuccess: done });
  };

  return (
    <>
      <Button
        variant="outline"
        size="lg"
        leftIcon={<ShoppingBasket className="h-4 w-4" aria-hidden />}
        onClick={() => (access === 'locked' ? router.push('/pricing') : setOpen(true))}
      >
        {t.baskets.add}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t.baskets.add}>
        <div className="flex flex-col gap-3">
          <Select
            label={t.baskets.which}
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            options={[{ value: NEW, label: t.baskets.newBasket }, ...(carts ?? []).map((c) => ({ value: c.id, label: c.name }))]}
          />
          {choice === NEW && (
            <>
              <Input label={t.baskets.nameLabel} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.baskets.defaultName} maxLength={80} />
              <Input label={t.baskets.targetLabel} inputMode="numeric" dir="ltr" value={target} onChange={(e) => setTarget(e.target.value)} />
            </>
          )}
          <Button loading={create.isPending || update.isPending} onClick={submit}>
            {t.baskets.confirm}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
