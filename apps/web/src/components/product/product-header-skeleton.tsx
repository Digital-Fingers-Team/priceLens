import { Skeleton } from '@/components/ui/skeleton';

export function ProductHeaderSkeleton() {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
      <Skeleton className="aspect-square rounded-2xl w-full" />
      <div className="space-y-5">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-4/5" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-36 w-full rounded-xl" />
        <div className="flex gap-3 pt-1">
          <Skeleton className="h-12 w-40 rounded-xl" />
          <Skeleton className="h-12 w-36 rounded-xl" />
        </div>
      </div>
    </section>
  );
}