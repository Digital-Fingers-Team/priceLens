import { Skeleton } from '@/components/ui/skeleton';
import { ProductCardSkeleton } from '@/components/product/product-card-skeleton';

export default function SearchLoading() {
  return (
    <div aria-hidden className="mx-auto flex max-w-page flex-col gap-6 px-4 py-8 sm:px-6">
      <Skeleton className="h-10 w-full max-w-2xl rounded-full" />
      <div className="flex justify-between">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-48" />
      </div>
      <Skeleton className="h-8 w-24" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
