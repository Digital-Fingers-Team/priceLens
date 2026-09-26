import { Skeleton } from '@/components/ui/skeleton';

export function PriceChartSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded border border-border bg-surface p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-56" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
