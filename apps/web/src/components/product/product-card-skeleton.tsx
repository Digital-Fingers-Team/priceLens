import { Skeleton } from '@/components/ui/skeleton';

/** Same shape as ProductCard at every width (a row on phones), so results
 *  replace it without the page jumping. */
export function ProductCardSkeleton() {
  return (
    <div aria-hidden className="flex overflow-hidden rounded-md border border-border bg-surface sm:block">
      <Skeleton className="aspect-square w-28 shrink-0 rounded-none sm:aspect-product sm:w-full" />
      <div className="flex flex-1 flex-col gap-2 p-3 sm:gap-3 sm:p-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}
