// Server component: one real product, priced by every store that sells it.
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { productApi } from '@/lib/api/product.api';
import { searchApi } from '@/lib/api/search.api';
import { Link } from '@/lib/i18n/navigation';
import type { Locale } from '@/lib/i18n/config';
import { getI18n } from '@/lib/i18n/server';
import { productTitle } from '@/lib/product-title';
import type { SourceListing } from '@/types/product.types';

const MAX_ROWS = 5;

/** The cheapest live offer per store, cheapest store first. */
export function cheapestPerStore(listings: SourceListing[]): SourceListing[] {
  const best = new Map<string, SourceListing>();
  for (const listing of listings) {
    if (listing.inStock === false || !listing.rawPrice || listing.rawPrice <= 0) continue;
    const current = best.get(listing.platformId);
    if (!current || listing.rawPrice < (current.rawPrice ?? Infinity)) best.set(listing.platformId, listing);
  }
  return [...best.values()].sort((a, b) => (a.rawPrice ?? 0) - (b.rawPrice ?? 0));
}

/**
 * The hero's right side: what Pricelens does, shown with live data instead
 * of described. Picks the product the most stores sell (browse order) and
 * lists each store's price. Renders nothing if the API is down or no product
 * has two stores in one currency; the hero stands on its own without it.
 */
export async function HeroComparison({ locale }: { locale: Locale }) {
  const { t, tf, tp, fmt } = getI18n(locale);
  let rows: SourceListing[] = [];
  let product;
  try {
    const { hits } = await searchApi.search({ q: '', sortBy: 'relevance', sortDir: 'desc', limit: 6, page: 1 });
    for (const hit of hits.filter((h) => h.imageUrl && (h.storeCount ?? 0) >= 3)) {
      const { items } = await productApi.getListings(hit.id, 1, 50);
      const stores = cheapestPerStore(items);
      // Prices are in each store's own currency; only compare like with like.
      const sameCurrency = stores.filter((s) => s.rawCurrency === stores[0]?.rawCurrency);
      if (sameCurrency.length >= 3) {
        product = hit;
        rows = sameCurrency;
        break;
      }
    }
  } catch {
    return null;
  }
  if (!product || rows.length === 0) return null;

  const shown = rows.slice(0, MAX_ROWS);
  const cheapest = rows[0];
  const highest = rows[rows.length - 1];
  const saving = (highest.rawPrice ?? 0) - (cheapest.rawPrice ?? 0);
  const currency = cheapest.rawCurrency;
  const href = `/products/${product.slug}`;

  return (
    <figure className="flex flex-col overflow-hidden rounded-md border border-border bg-surface shadow">
      <div className="flex items-center gap-4 border-b border-border p-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-sm bg-media">
          <Image src={product.imageUrl as string} alt="" fill sizes="64px" className="object-contain p-1 mix-blend-multiply" />
        </div>
        <figcaption className="flex min-w-0 flex-col gap-1">
          <p className="label-mono text-muted">{tp(t.home.live.stores, rows.length)}</p>
          <p dir="auto" className="line-clamp-2 text-sm font-medium text-fg">
            {productTitle(product, locale)}
          </p>
        </figcaption>
      </div>

      <ol className="flex flex-col p-2">
        {shown.map((offer, i) => (
          <li
            key={offer.id}
            className={
              i === 0
                ? 'flex items-center justify-between gap-4 rounded-sm bg-brand-soft px-3 py-2 text-brand-soft-fg'
                : 'flex items-center justify-between gap-4 px-3 py-2'
            }
          >
            <span className="flex min-w-0 items-center gap-2">
              <span translate="no" className="truncate text-sm font-medium">
                {offer.platform.name}
              </span>
              {i === 0 && <span className="label-mono text-brand-text">{t.home.live.cheapest}</span>}
            </span>
            <span className={i === 0 ? 'text-base font-semibold tabular-nums' : 'text-sm tabular-nums text-muted'}>
              {fmt.currency(offer.rawPrice, offer.rawCurrency)}
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
        {saving > 0 ? (
          <p className="rounded-sm bg-accent px-2 py-1 text-xs font-medium text-accent-fg">
            {tf(t.home.live.save, { amount: fmt.currency(saving, currency) })}
          </p>
        ) : (
          <span />
        )}
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-brand-text hover:underline">
          {t.home.live.open}
          <ArrowRight className="flip-rtl h-4 w-4" aria-hidden />
        </Link>
      </div>
    </figure>
  );
}
