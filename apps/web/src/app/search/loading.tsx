import { Skeleton } from '@/components/ui/skeleton';
import { ProductCardSkeleton } from '@/components/product/product-card-skeleton';

export default function SearchLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Skeleton className="h-10 w-full max-w-2xl rounded-xl" />
      <Skeleton className="h-4 w-48" />
      <div className="flex gap-8">
        {/* Filters skeleton */}
        <div className="w-56 shrink-0 space-y-6 hidden md:block">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-9 w-full rounded-lg" />
              ))}
            </div>
          ))}
        </div>
        {/* Grid skeleton */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}