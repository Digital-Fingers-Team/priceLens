import { Skeleton } from '@/components/ui/skeleton';

export function ProductCardSkeleton() {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 overflow-hidden">
      <Skeleton className="w-full aspect-[4/3]" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-24" />
        <div className="pt-2 border-t border-ink-800 space-y-1.5">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-7 w-36" />
        </div>
        <div className="flex items-center justify-between pt-1">
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </div>
    </div>
  );
}