import { cn } from '@/lib/utils/cn';

interface SkeletonProps {
  className?: string;
  lines?: number;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-ink-700/60',
        className,
      )}
    />
  );
}
