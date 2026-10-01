'use client';
import { productTitle } from '@/lib/product-title';
import dynamic from 'next/dynamic';
import { PriceChartSkeleton } from '@/components/charts/price-chart-skeleton';
import { IntelligencePanel } from '@/components/intelligence/intelligence-panel';
import { LandedCostCard } from '@/components/intelligence/landed-cost-card';
import { BuyerExtrasPanel } from '@/components/buyer/buyer-extras';
import { ListingTableSkeleton } from '@/components/product/listing-table-skeleton';
import { OfferList } from '@/components/product/offer-list';
import { ProductHeader } from '@/components/product/product-header';
import { ProductHeaderSkeleton } from '@/components/product/product-header-skeleton';
import { ShareActions } from '@/components/product/share-actions';
import { Breadcrumbs } from '@/components/seo/breadcrumbs';
import { Button } from '@/components/ui/button';
import { buttonClassName } from '@/components/ui/button-styles';
import { ErrorState } from '@/components/ui/state';
import { usePriceStats } from '@/lib/hooks/use-price-history';
import { useProduct } from '@/lib/hooks/use-product';
import { RenderedAtProvider } from '@/lib/hooks/use-now';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import type { CanonicalProduct } from '@/types/product.types';

interface ProductDetailClientProps {
  slug: string;
  /** Fetched on the server so the first paint is the product, not a skeleton. */
  initialProduct?: CanonicalProduct;
  /** When the server fetched initialProduct (ms since epoch). */
  fetchedAt?: number;
}

const PAGE = 'mx-auto flex max-w-page flex-col gap-12 px-4 py-8 sm:px-6';

// Recharts is the page's heaviest dependency and the chart sits below the
// offers; it loads after the page is interactive (audit 08, P-07). The chart
// showed a skeleton on the server already (its colors come from the browser).
const PriceChart = dynamic(() => import('@/components/charts/price-chart').then((m) => m.PriceChart), {
  ssr: false,
  loading: () => <PriceChartSkeleton />,
});

export function ProductDetailClient({ slug, initialProduct, fetchedAt }: ProductDetailClientProps) {
  const { t, tf, tp, fmt, locale } = useI18n();
  const { data: product, isLoading, refetch } = useProduct(slug, initialProduct, fetchedAt);
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

  // Only when there is nothing to show. A failed background refresh (isError
  // with data, e.g. a 429 or a deploy's API restart) keeps the product on
  // screen; it used to replace the whole page with this error (audit 11).
  if (!product) {
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
  const categoryName = (t.categories as Record<string, string>)[product.category.slug] ?? product.category.name;

  // Order follows what a visitor came for (audit 06, U-01): which store is
  // cheapest and a way to go there, then whether to buy now, then the history
  // behind that advice. Each price figure appears once.
  return (
    <RenderedAtProvider value={fetchedAt}>
      <div className={PAGE}>
        <div className="flex flex-col gap-6">
          {/* Where the product sits, and the way to its category (audit 09). */}
          <Breadcrumbs
            label={t.seo.breadcrumbs}
            items={[
              { label: t.seo.home, href: '/' },
              { label: categoryName, href: `/categories/${product.category.slug}` },
              { label: productTitle(product, locale) },
            ]}
          />
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
          <LandedCostCard productId={product.id} />
          <BuyerExtrasPanel productId={product.id} />
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
          title={productTitle(product, locale)}
          path={`/products/${product.slug}`}
          summary={tf(t.share.summary, { title: productTitle(product, locale), price: fmt.currency(product.priceStats.min, currency) })}
        />
      </div>
    </RenderedAtProvider>
  );
}
