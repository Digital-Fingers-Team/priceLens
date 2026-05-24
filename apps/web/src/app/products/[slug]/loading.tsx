import { ProductHeaderSkeleton } from '@/components/product/product-header-skeleton';
import { ListingTableSkeleton } from '@/components/product/listing-table-skeleton';
import { PriceChartSkeleton } from '@/components/charts/price-chart-skeleton';

export default function ProductLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 rounded-full border border-ink-700" />
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
