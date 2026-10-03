import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export type BadgeVariant = 'neutral' | 'brand' | 'savings' | 'success' | 'warning' | 'danger' | 'info' | 'outline';

const variants: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-2 text-muted',
  brand: 'bg-brand-soft text-brand-soft-fg',
  // Money saved only (discounts, the lowest price): coral is a background.
  savings: 'bg-accent text-accent-fg',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  outline: 'border border-border-strong text-muted',
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** A status dot before the text. */
  dot?: boolean;
}

/** Status only (in stock, best deal, plan): not decoration. */
export function Badge({ variant = 'neutral', dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-sm px-2 font-mono text-xs font-medium uppercase tracking-wide',
        variants[variant],
        className,
      )}
      {...props}
    >
      {dot && <span className="h-1 w-1 shrink-0 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
