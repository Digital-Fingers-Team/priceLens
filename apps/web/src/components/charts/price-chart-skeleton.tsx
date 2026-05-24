import { Skeleton } from '@/components/ui/skeleton';

export function PriceChartSkeleton() {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="h-8 w-40 rounded-lg" />
      </div>
      <Skeleton className="h-[280px] w-full rounded-xl" />
    </div>
  );
}