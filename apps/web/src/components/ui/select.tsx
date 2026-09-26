import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { controlHeight, type Size } from './button-styles';
import { Field, controlClassName, useFieldIds, type FieldProps } from './field';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>, FieldProps {
  options: SelectOption[];
  size?: Size;
  /** A first, empty option (e.g. "All categories"). */
  placeholder?: string;
  wrapperClassName?: string;
}

/** A native <select>: keyboard, screen readers and phone pickers for free. */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hint, error, options, size = 'md', placeholder, className, wrapperClassName, id, ...props }, ref) => {
    const { controlId, messageId, aria } = useFieldIds(id, { hint, error });
    return (
      <Field label={label} hint={hint} error={error} controlId={controlId} messageId={messageId} className={wrapperClassName}>
        <div className="relative flex items-center">
          <select
            ref={ref}
            id={controlId}
            {...aria}
            className={cn(controlClassName, controlHeight[size], 'cursor-pointer appearance-none pe-9 ps-3', className)}
            {...props}
          >
            {placeholder != null && <option value="">{placeholder}</option>}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute end-3 h-4 w-4 text-muted" aria-hidden />
        </div>
      </Field>
    );
  },
);
Select.displayName = 'Select';
