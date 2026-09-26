import * as React from 'react';
import { cn } from '@/lib/utils/cn';

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: React.ReactNode;
  description?: React.ReactNode;
}

/** Native checkbox in the brand color, with a 44px-tall hit area. */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className, id, disabled, ...props }, ref) => {
    const generated = React.useId();
    const inputId = id ?? generated;
    return (
      <label
        htmlFor={inputId}
        className={cn('flex min-h-11 cursor-pointer items-start gap-3 py-3', disabled && 'cursor-not-allowed opacity-50', className)}
      >
        {/* A 20px row, the height of the label line, centers the box on it. */}
        <span className="flex h-5 shrink-0 items-center">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            disabled={disabled}
            className="h-4 w-4 cursor-pointer rounded-sm accent-brand disabled:cursor-not-allowed"
            {...props}
          />
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-sm text-fg">{label}</span>
          {description && <span className="text-xs text-muted">{description}</span>}
        </span>
      </label>
    );
  },
);
Checkbox.displayName = 'Checkbox';
