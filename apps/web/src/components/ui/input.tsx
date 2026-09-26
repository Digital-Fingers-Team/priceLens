import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { controlHeight, type Size } from './button-styles';
import { Field, controlClassName, useFieldIds, type FieldProps } from './field';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>, FieldProps {
  size?: Size;
  /** Icon inside the field at the start (left in LTR, right in RTL). */
  leftIcon?: React.ReactNode;
  /** Element inside the field at the end. */
  rightElement?: React.ReactNode;
  wrapperClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, size = 'md', leftIcon, rightElement, className, wrapperClassName, id, ...props }, ref) => {
    const { controlId, messageId, aria } = useFieldIds(id, { hint, error });
    return (
      <Field label={label} hint={hint} error={error} controlId={controlId} messageId={messageId} className={wrapperClassName}>
        <div className="relative flex items-center">
          {leftIcon && (
            <span className="pointer-events-none absolute start-3 flex text-muted" aria-hidden>
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={controlId}
            {...aria}
            className={cn(controlClassName, controlHeight[size], leftIcon ? 'ps-10' : 'ps-3', rightElement ? 'pe-10' : 'pe-3', className)}
            {...props}
          />
          {rightElement && <span className="absolute end-2 flex text-muted">{rightElement}</span>}
        </div>
      </Field>
    );
  },
);
Input.displayName = 'Input';
