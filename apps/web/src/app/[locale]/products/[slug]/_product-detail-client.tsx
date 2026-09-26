'use client';
import { ArrowLeft } from 'lucide-react';
import { PriceChart } from '@/components/charts/price-chart';
import { PriceChartSkeleton } from '@/components/charts/price-chart-skeleton';
import { IntelligencePanel } from '@/components/intelligence/intelligence-panel';
import { ListingTableSkeleton } from '@/components/product/listing-table-skeleton';
import { OfferList } from '@/components/product/offer-list';
import { ProductHeader } from '@/components/product/product-header';
import { ProductHeaderSkeleton } from '@/components/product/product-header-skeleton';
import { ShareActions } from '@/components/product/share-actions';
import { Button } from '@/components/ui/button';
import { buttonClassName } from '@/components/ui/button-styles';
import { ErrorState } from '@/components/ui/state';
import { usePriceStats } from '@/lib/hooks/use-price-history';
import { useProduct } from '@/lib/hooks/use-product';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import type { CanonicalProduct } from '@/types/product.types';

interface ProductDetailClientProps {
  slug: string;
  /** Fetched on the server so the first paint is the product, not a skeleton. */
  initialProduct?: CanonicalProduct;
}

const PAGE = 'mx-auto flex max-w-page flex-col gap-12 px-4 py-8 sm:px-6';

export function ProductDetailClient({ slug, initialProduct }: ProductDetailClientProps) {
  const { t, tf, tp, fmt } = useI18n();
  const { data: product, isLoading, isError, refetch } = useProduct(slug, initialProduct);
  const { data: stats } = usePriceStats(product?.id ?? '');

  if (isLoading) {
    return (
      <div className={PAGE} aria-busy="true" aria-label={t.product.loading}>
        <ProductHeaderSkeleton />
        <ListingTableSkeleton rows={4} />
        <PriceChartSkeleton />
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className={PAGE}>
        <ErrorState
          title={t.product.unavailableTitle}
          description={t.product.unavailableBody}
          action={
            <>
              <Button onClick={() => refetch()}>{t.common.retry}</Button>
              <Link href="/search" className={buttonClassName({ variant: 'secondary' })}>
                {t.product.browseAll}
              </Link>
            </>
          }
        />
      </div>
    );
  }

  const listings = product.sourceListings ?? [];
  const allTime = stats?.allTime;
  const week52 = stats?.week52;
  const currency = product.priceStats.currency;
  const storeCount = new Set(listings.map((l) => l.platform.id)).size;

  // Order follows what a visitor came for (audit 06, U-01): which store is
  // cheapest and a way to go there, then whether to buy now, then the history
  // behind that advice. Each price figure appears once.
  return (
    <div className={PAGE}>
      <div className="flex flex-col gap-6">
        <Link href="/search" className="inline-flex items-center gap-1 self-start text-sm text-muted transition-colors hover:text-fg">
          <ArrowLeft className="flip-rtl h-4 w-4" aria-hidden />
          {t.product.backToSearch}
        </Link>
        <ProductHeader product={product} />
      </div>

      <section id="offers" aria-labelledby="offers-heading" className="flex scroll-mt-24 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="offers-heading" className="text-lg font-semibold text-fg">
            {tp(t.product.compareStoresHeading, storeCount)}
          </h2>
          <p className="text-sm text-muted">{t.product.offersLede}</p>
        </div>
        <OfferList listings={listings} />
      </section>

      <IntelligencePanel productId={product.id} />

      <section aria-labelledby="history-heading" className="flex flex-col gap-4">
        <h2 id="history-heading" className="text-lg font-semibold text-fg">
          {t.product.priceHistory}
        </h2>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-4">
          {[
            [t.product.week52Low, fmt.currency(week52?.low, currency)],
            [t.product.week52High, fmt.currency(week52?.high, currency)],
            [t.product.allTimeLow, fmt.currency(allTime?.min, currency)],
            [t.product.allTimeHigh, fmt.currency(allTime?.max, currency)],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1 bg-surface p-4">
              <dt className="label-mono text-muted">{label}</dt>
              <dd className="font-semibold tabular-nums text-fg">{value}</dd>
            </div>
          ))}
        </dl>
        <PriceChart productId={product.id} />
      </section>

      {/* Secondary: after the comparison, not between the price and the stores. */}
      <ShareActions
        title={product.title}
        path={`/products/${product.slug}`}
        summary={tf(t.share.summary, { title: product.title, price: fmt.currency(product.priceStats.min, currency) })}
      />
    </div>
  );
}
