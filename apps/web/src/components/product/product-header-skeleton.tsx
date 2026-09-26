import { Skeleton } from '@/components/ui/skeleton';

export function ProductHeaderSkeleton() {
  return (
    <section aria-hidden className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
      <Skeleton className="aspect-square w-full" />
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-4/5" />
        </div>
        <Skeleton className="h-48 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-12 w-40" />
          <Skeleton className="h-12 w-36" />
        </div>
      </div>
    </section>
  );
}
