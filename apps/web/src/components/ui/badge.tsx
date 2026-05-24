import * as React from 'react';
import { cn } from '@/lib/utils/cn';

type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'outline'
  | 'premium';

const variants: Record<BadgeVariant, string> = {
  default:  'bg-ink-700 text-ink-200 border-ink-600',
  success:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warning:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  danger:   'bg-red-500/10 text-red-400 border-red-500/20',
  info:     'bg-blue-500/10 text-blue-400 border-blue-500/20',
  outline:  'bg-transparent text-ink-300 border-ink-600',
  premium:  'bg-gradient-to-r from-amber-500/20 to-yellow-500/10 text-amber-300 border-amber-500/30',
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

export function Badge({
  variant = 'default',
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5',
        'text-xs font-medium rounded-full border',
        'whitespace-nowrap',
        variants[variant],
        className,
      )}
      {...props}
    >
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80 shrink-0" />
      )}
      {children}
    </span>
  );
}