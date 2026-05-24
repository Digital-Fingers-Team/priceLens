// card.tsx
import * as React from 'react';
import { cn } from '@/lib/utils/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  glass?: boolean;
}

export function Card({ hover, glass, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-ink-700 bg-ink-900',
        hover && 'transition-all duration-200 hover:border-ink-500 hover:bg-ink-800 cursor-pointer',
        glass && 'bg-ink-900/60 backdrop-blur-sm',
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
    <div className={cn('px-5 py-4 border-b border-ink-700', className)} {...props}>
      {children}
    </div>
  );
}

export function CardBody({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-5 py-4', className)} {...props}>
      {children}
    </div>
  );
}