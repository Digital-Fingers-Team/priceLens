import { cn } from '@/lib/utils/cn';

// Plain module (no 'use client'): server components such as not-found.tsx
// call buttonClassName() directly, which they cannot do across a client
// boundary.

export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type Size    = 'xs' | 'sm' | 'md' | 'lg';

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-signal text-ink-950 font-semibold hover:bg-signal-dim active:scale-[0.98] shadow-[0_0_20px_rgba(0,255,136,0.15)]',
  secondary:
    'bg-ink-700 text-ink-100 hover:bg-ink-600 border border-ink-600',
  ghost:
    'bg-transparent text-ink-300 hover:bg-ink-800 hover:text-ink-100',
  danger:
    'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20',
  outline:
    'bg-transparent border border-ink-600 text-ink-200 hover:border-signal/50 hover:text-signal',
};

const sizeStyles: Record<Size, string> = {
  xs: 'h-7  px-2.5 text-xs  gap-1.5',
  sm: 'h-8  px-3   text-sm  gap-2',
  md: 'h-10 px-4   text-sm  gap-2',
  lg: 'h-12 px-6   text-base gap-2.5',
};

const baseStyles = [
  'inline-flex items-center justify-center rounded-lg font-medium',
  'transition-all duration-150 focus-visible:outline-none',
  'focus-visible:ring-2 focus-visible:ring-signal/50 focus-visible:ring-offset-2',
  'focus-visible:ring-offset-ink-950 disabled:opacity-40 disabled:cursor-not-allowed',
];

/**
 * Button styling for elements that are not buttons -- chiefly a `<Link>` that
 * should look like one. Wrapping a <Button> in a <Link> nests a button inside
 * an anchor: invalid HTML and two tab stops for one action (audit 05, FE-07).
 */
export function buttonClassName({
  variant = 'primary',
  size = 'md',
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(...baseStyles, variantStyles[variant], sizeStyles[size], className);
}
