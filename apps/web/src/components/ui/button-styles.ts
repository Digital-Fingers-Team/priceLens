import { cn } from '@/lib/utils/cn';

// Plain module (no 'use client'): server components such as not-found.tsx
// call buttonClassName() directly, which they cannot do across a client
// boundary.

export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type Size = 'sm' | 'md' | 'lg';

// Controls share heights: sm 32, md 40, lg 48 (inputs and selects too).
export const controlHeight: Record<Size, string> = {
  sm: 'h-8',
  md: 'h-10',
  lg: 'h-12',
};

const variantStyles: Record<Variant, string> = {
  primary: 'bg-brand text-brand-fg hover:bg-brand-hover active:bg-brand-hover',
  secondary: 'border border-border bg-surface text-fg hover:bg-surface-2 active:bg-surface-2',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg active:bg-surface-2',
  outline: 'border border-border-strong text-fg hover:border-brand hover:text-brand active:bg-surface-2',
  danger: 'border border-danger/40 bg-danger-soft text-danger hover:border-danger active:bg-danger-soft',
};

const sizeStyles: Record<Size, string> = {
  sm: 'px-3 gap-2',
  md: 'px-4 gap-2',
  lg: 'px-6 gap-2 text-sm',
};

// Mono uppercase labels on buttons (the owner's reference card).
const baseStyles =
  'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded font-mono text-xs font-medium uppercase tracking-wider transition-colors disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50';

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
  return cn(baseStyles, controlHeight[size], variantStyles[variant], sizeStyles[size], className);
}

/** Square icon-only button of the same heights. */
export function iconButtonClassName({
  variant = 'ghost',
  size = 'md',
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  const square: Record<Size, string> = { sm: 'w-8', md: 'w-10', lg: 'w-12' };
  return cn(baseStyles, controlHeight[size], square[size], variantStyles[variant], 'px-0', className);
}
