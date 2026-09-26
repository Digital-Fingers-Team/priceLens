import { Skeleton } from '@/components/ui/skeleton';

/** Same shape as ProductCard at every width (a row on phones), so results
 *  replace it without the page jumping. */
export function ProductCardSkeleton() {
  return (
    <div
      aria-hidden
      className="flex sm:block rounded-xl border border-ink-700 bg-ink-900 overflow-hidden"
    >
      <Skeleton className="w-28 shrink-0 aspect-square sm:w-full sm:aspect-[4/3] rounded-none" />
      <div className="flex-1 p-3 sm:p-4 space-y-2 sm:space-y-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}
