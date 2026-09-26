'use client';
import * as React from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils/cn';
import { IconButton } from './button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** `sheet`: slides up from the bottom on phones, a centered modal from md. */
  variant?: 'modal' | 'sheet';
  footer?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Modal and bottom sheet on the native <dialog> element: showModal() gives
 * the focus trap, Esc, inert background and top layer without a library.
 * A click on the backdrop (the dialog element itself, outside the panel)
 * closes it.
 */
export function Dialog({ open, onClose, title, description, variant = 'modal', footer, className, children }: DialogProps) {
  const { t } = useI18n();
  const ref = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // jsdom has no showModal; fall back to the open attribute there.
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        'glass max-h-sheet w-full overflow-hidden border border-border p-0 text-fg shadow-lg backdrop:bg-moss-900/50',
        variant === 'sheet'
          ? 'mb-0 mt-auto max-w-none animate-sheet-up rounded-t-md md:m-auto md:max-w-lg md:animate-enter md:rounded-md'
          : 'm-auto max-w-lg animate-enter rounded-md',
        className,
      )}
    >
      {open && (
        <div className="flex max-h-sheet flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
            <div className="flex flex-col gap-1">
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="text-sm text-muted">
                  {description}
                </p>
              )}
            </div>
            <IconButton size="sm" aria-label={t.common.close} onClick={onClose} className="-me-2">
              <X className="h-4 w-4" />
            </IconButton>
          </div>
          <div className="overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border px-4 py-3 sm:px-6">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
