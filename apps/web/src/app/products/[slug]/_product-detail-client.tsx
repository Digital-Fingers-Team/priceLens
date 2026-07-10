'use client';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Store } from 'lucide-react';
import { ProductHeader } from '@/components/product/product-header';
import { ProductHeaderSkeleton } from '@/components/product/product-header-skeleton';
import { ListingTable } from '@/components/product/listing-table';
import { ListingTableSkeleton } from '@/components/product/listing-table-skeleton';
import { PriceChart } from '@/components/charts/price-chart';
import { PriceChartSkeleton } from '@/components/charts/price-chart-skeleton';
import { PriceStatsBar } from '@/components/product/price-stats-bar';
import { Button } from '@/components/ui/button';
import { usePriceStats } from '@/lib/hooks/use-price-history';
import { formatCurrency } from '@/lib/utils/format';
import { useProduct } from '@/lib/hooks/use-product';

interface ProductDetailClientProps {
  slug: string;
}

function ProductDetailSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex items-center gap-3">
        <Store className="w-5 h-5 text-ink-700" />
        <span className="text-sm text-ink-500">Loading product details</span>
      </div>
      <ProductHeaderSkeleton />
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3">
          <PriceChartSkeleton />
        </div>
        <div className="xl:col-span-2">
          <ListingTableSkeleton rows={5} />
        </div>
      </div>
    </div>
  );
}

export function ProductDetailClient({ slug }: ProductDetailClientProps) {
  const { data: product, isLoading, isError, refetch } = useProduct(slug);
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <Link href="/search" className="text-sm text-ink-500 hover:text-signal transition-colors">
          ← Back to search
        </Link>
        <div className="text-xs text-ink-500">
          {listings.length} listing{listings.length === 1 ? '' : 's'}
        </div>
      </div>

      <ProductHeader product={product} />

      <div className="space-y-6">
        <PriceStatsBar
          min={product.priceStats.min}
          max={product.priceStats.max}
          avg={product.priceStats.avg}
          week52Low={week52?.low ?? null}
          week52High={week52?.high ?? null}
        />

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          <div className="xl:col-span-3">
            <PriceChart productId={product.id} />
          </div>

          <div className="xl:col-span-2 rounded-xl border border-ink-700 bg-ink-900 p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-ink-100">Price Snapshot</h2>
              <p className="text-xs text-ink-500 mt-1">All-time statistics for this product</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-3">
                <p className="text-ink-500 text-xs">All-time low</p>
                <p className="text-ink-100 font-semibold mt-1">
                  {formatCurrency(allTime?.min)}
                </p>
              </div>
              <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-3">
                <p className="text-ink-500 text-xs">All-time high</p>
                <p className="text-ink-100 font-semibold mt-1">
                  {formatCurrency(allTime?.max)}
                </p>
              </div>
              <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-3">
                <p className="text-ink-500 text-xs">Data points</p>
                <p className="text-ink-100 font-semibold mt-1">{allTime?.dataPoints ?? 0}</p>
              </div>
              <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-3">
                <p className="text-ink-500 text-xs">Current median</p>
                <p className="text-ink-100 font-semibold mt-1">
                  {formatCurrency(product.priceStats.median)}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-3 text-xs text-ink-500">
              Historical prices and store listings update as new data is ingested.
            </div>
          </div>
        </div>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-100">Store Listings</h2>
            <p className="text-sm text-ink-500 mt-1">
              Matching listings across retailers, sorted by confidence and price.
            </p>
          </div>
          <ListingTable listings={listings} showConfidence />
        </section>
      </div>
    </div>
  );
}
