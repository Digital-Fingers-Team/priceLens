import { Skeleton } from '@/components/ui/skeleton';

/** Same shape as OfferList's rows. */
export function ListingTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden className="divide-y divide-border rounded border border-border bg-surface">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid gap-3 p-4 sm:grid-cols-offer sm:items-center sm:gap-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-10 w-full sm:w-32" />
        </div>
      ))}
    </div>
  );
}
