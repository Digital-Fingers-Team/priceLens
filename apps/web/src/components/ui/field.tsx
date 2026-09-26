import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
}

/** Ids for a control and its hint/error, and the aria props that tie them. */
export function useFieldIds(id: string | undefined, { hint, error }: FieldProps) {
  const generated = React.useId();
  const controlId = id ?? generated;
  const messageId = `${controlId}-message`;
  return {
    controlId,
    messageId,
    aria: {
      'aria-invalid': error ? true : undefined,
      'aria-describedby': error || hint ? messageId : undefined,
    } as const,
  };
}

/** Label above, message below: the layout every control shares. */
export function Field({
  label,
  hint,
  error,
  controlId,
  messageId,
  className,
  children,
}: FieldProps & { controlId: string; messageId: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex w-full flex-col gap-1', className)}>
      {label && (
        <label htmlFor={controlId} className="text-sm font-medium text-fg">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={messageId} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Shared look of text inputs and selects: same heights as buttons. */
export const controlClassName =
  'w-full rounded border border-border-strong bg-surface text-sm text-fg transition-colors placeholder:text-muted hover:border-fg/60 focus-visible:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand/40 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger';
