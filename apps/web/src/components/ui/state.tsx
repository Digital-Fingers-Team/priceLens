import * as React from 'react';
import { cn } from '@/lib/utils/cn';

interface StateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Buttons or links. */
  action?: React.ReactNode;
  className?: string;
}

function StateBlock({ icon, title, description, action, className, tone }: StateProps & { tone: 'neutral' | 'danger' }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className={cn('flex flex-col items-center gap-4 px-4 py-12 text-center', className)}
    >
      {icon && (
        <span
          aria-hidden
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded border',
            tone === 'danger' ? 'border-danger/30 bg-danger-soft text-danger' : 'border-border bg-surface-2 text-muted',
          )}
        >
          {icon}
        </span>
      )}
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-base font-medium text-fg">{title}</p>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Nothing to show (no results, empty watchlist): says why and what next. */
export function EmptyState(props: StateProps) {
  return <StateBlock {...props} tone="neutral" />;
}

/** Something failed: says so plainly and offers a retry. */
export function ErrorState(props: StateProps) {
  return <StateBlock {...props} tone="danger" />;
}
