import { cn } from '@/lib/utils/cn';

/** Decorative: the control that spins carries aria-busy / a label. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4 shrink-0 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
