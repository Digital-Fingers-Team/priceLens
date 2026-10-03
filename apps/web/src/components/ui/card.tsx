import * as React from 'react';
import { cn } from '@/lib/utils/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Hover feedback for a card that is itself a link or button. */
  interactive?: boolean;
}

/** A flat surface with a hairline border. Never nest one card in another. */
export function Card({ interactive, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-md border border-border bg-surface',
        interactive && 'transition-colors hover:border-border-strong',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6', className)} {...props}>
      {children}
    </div>
  );
}

export function CardBody({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-4 py-4 sm:px-6', className)} {...props}>
      {children}
    </div>
  );
}
