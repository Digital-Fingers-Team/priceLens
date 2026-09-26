import { cn } from '@/lib/utils/cn';

/** Loading placeholder; the pulse stops under prefers-reduced-motion. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-sm bg-surface-2', className)} />;
}
