import Image from 'next/image';
import { ImageOff } from 'lucide-react';
import { productTitle } from '@/lib/product-title';
import { Link } from '@/lib/i18n/navigation';
import type { getI18n } from '@/lib/i18n/server';
import type { PriceDrop } from '@/types/deals.types';

type I18n = ReturnType<typeof getI18n>;

/**
 * One price drop, rendered on the server: the product, today's price at the
 * store, its usual price there and the drop. The card links to the product
 * page (every store's price), not to the store.
 */
export function DropCard({ drop, i18n, priority = false }: { drop: PriceDrop; i18n: I18n; priority?: boolean }) {
  const { t, tf, tp, fmt, locale } = i18n;
  return (
    <article className="group relative flex h-full min-w-0 overflow-hidden rounded-md border border-border bg-surface transition hover:border-border-strong hover:shadow focus-within:border-brand sm:flex-col">
      <div className="relative aspect-square w-28 shrink-0 bg-media sm:aspect-product sm:w-full">
        {drop.imageUrl ? (
          <Image
            src={drop.imageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 112px, (max-width: 1024px) 50vw, 25vw"
            priority={priority}
            className="object-contain p-2 mix-blend-multiply sm:p-4"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted">
            <ImageOff className="h-6 w-6" aria-hidden />
          </div>
        )}
        <span className="absolute start-2 top-2 rounded-sm bg-danger-soft px-2 py-1 text-xs font-semibold tabular-nums text-danger">
          −{fmt.number(drop.dropPct)}%
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 sm:gap-3 sm:p-4">
        {drop.brand && <p className="label-mono truncate text-muted">{drop.brand}</p>}
        <h3 dir="auto" className="line-clamp-3 text-sm font-medium text-fg">
          <Link href={`/products/${drop.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {productTitle(drop, locale)}
          </Link>
        </h3>
        <div className="mt-auto flex flex-col gap-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="whitespace-nowrap text-lg font-semibold tabular-nums text-fg">{fmt.currency(drop.price)}</span>
            <span className="whitespace-nowrap text-xs tabular-nums text-muted line-through">{fmt.currency(drop.usualPrice)}</span>
          </p>
          <p className="text-xs text-muted">
            {tf(t.priceDrops.atStore, { store: drop.store })} ·{' '}
            <span className="font-medium text-success">{tf(t.priceDrops.save, { amount: fmt.currency(drop.usualPrice - drop.price) })}</span>
          </p>
          {drop.storeCount > 1 && <p className="text-xs text-brand-text">{tp(t.priceDrops.compare, drop.storeCount)}</p>}
        </div>
      </div>
    </article>
  );
}
