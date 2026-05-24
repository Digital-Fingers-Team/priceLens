import { Skeleton } from '@/components/ui/skeleton';

export function ListingTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-ink-700 overflow-hidden">
      <div className="px-4 py-3 bg-ink-900/50 border-b border-ink-700 flex gap-8">
        {['Store', 'Price', 'Stock', 'Rating', 'Updated'].map((h) => (
          <Skeleton key={h} className="h-3 w-16" />
        ))}
      </div>
      <div className="divide-y divide-ink-800">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Skeleton className="w-5 h-5 rounded" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-7 w-16 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}