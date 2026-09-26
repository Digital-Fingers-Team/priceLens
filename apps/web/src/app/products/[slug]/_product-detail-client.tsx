'use client';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Store } from 'lucide-react';
import { ProductHeader } from '@/components/product/product-header';
import { ProductHeaderSkeleton } from '@/components/product/product-header-skeleton';
import { OfferList } from '@/components/product/offer-list';
import { ShareActions } from '@/components/product/share-actions';
import { ListingTableSkeleton } from '@/components/product/listing-table-skeleton';
import { PriceChart } from '@/components/charts/price-chart';
import { IntelligencePanel } from '@/components/intelligence/intelligence-panel';
import { PriceChartSkeleton } from '@/components/charts/price-chart-skeleton';
import { Button } from '@/components/ui/button';
import { usePriceStats } from '@/lib/hooks/use-price-history';
import { formatCurrency } from '@/lib/utils/format';
import { useProduct } from '@/lib/hooks/use-product';
import type { CanonicalProduct } from '@/types/product.types';

interface ProductDetailClientProps {
  slug: string;
  /** Fetched on the server so the first paint is the product, not a skeleton. */
  initialProduct?: CanonicalProduct;
}

function ProductDetailSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex items-center gap-3">
        <Store className="w-5 h-5 text-ink-700" />
        <span className="text-sm text-ink-500">Loading product details</span>
      </div>
      <ProductHeaderSkeleton />
      <ListingTableSkeleton rows={4} />
      <PriceChartSkeleton />
    </div>
  );
}

export function ProductDetailClient({ slug, initialProduct }: ProductDetailClientProps) {
  const { data: product, isLoading, isError, refetch } = useProduct(slug, initialProduct);
  const { data: stats } = usePriceStats(product?.id ?? '');

  if (isLoading) {
    return <ProductDetailSkeleton />;
  }

  if (isError || !product) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
        <div className="flex flex-col items-center text-center gap-6 max-w-md mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <Store className="w-8 h-8 text-red-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-ink-100">Product unavailable</h1>
            <p className="text-ink-400">
              We couldn&apos;t load this product. It may have been removed or there may be a temporary issue.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              leftIcon={<ArrowLeft className="w-4 h-4" />}
              onClick={() => history.back()}
            >
              Go back
            </Button>
            <Button
              variant="primary"
              leftIcon={<RefreshCw className="w-4 h-4" />}
              onClick={() => refetch()}
            >
              Try again
            </Button>
          </div>
          <Link href="/search" className="text-sm text-ink-500 hover:text-signal transition-colors">
            Browse all products
          </Link>
        </div>
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      <Link href="/search" className="inline-block text-sm text-ink-500 hover:text-signal transition-colors">
        ← Back to search
      </Link>

      <ProductHeader product={product} />

      <section id="offers" aria-labelledby="offers-heading" className="space-y-4 scroll-mt-24">
        <div>
          <h2 id="offers-heading" className="text-lg font-semibold text-ink-100">
            Compare {storeCount} store{storeCount === 1 ? '' : 's'}
          </h2>
          <p className="text-sm text-ink-500 mt-1">
            Cheapest first. Each price is the store&apos;s own, in its own currency.
          </p>
        </div>
        <OfferList listings={listings} />
      </section>

      <IntelligencePanel productId={product.id} />

      <section aria-labelledby="history-heading" className="space-y-4">
        <h2 id="history-heading" className="text-lg font-semibold text-ink-100">
          Price history
        </h2>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          {[
            ['52-week low', formatCurrency(week52?.low, currency)],
            ['52-week high', formatCurrency(week52?.high, currency)],
            ['All-time low', formatCurrency(allTime?.min, currency)],
            ['All-time high', formatCurrency(allTime?.max, currency)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-ink-800 bg-ink-900 p-3">
              <dt className="text-xs text-ink-500">{label}</dt>
              <dd className="mt-1 font-semibold text-ink-100">{value}</dd>
            </div>
          ))}
        </dl>
        <PriceChart productId={product.id} />
      </section>

      {/* Secondary: after the comparison, not between the price and the stores. */}
      <ShareActions
        title={product.title}
        url={`/products/${product.slug}`}
        summary={`${product.title} starts at ${formatCurrency(product.priceStats.min, currency)} on Pricelens.`}
      />
    </div>
  );
}
