'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { buttonClassName } from '@/components/ui/button-styles';
import { cn } from '@/lib/utils/cn';

/**
 * A disclosure menu of links: a button that opens a short list under it.
 * Closes on Escape (focus returns to the button), on a click outside, and
 * when an item is chosen. Items are plain links, so a menu item can still be
 * opened in a new tab.
 */
export function Menu({
  label,
  icon,
  children,
  className,
}: {
  label: ReactNode;
  icon?: ReactNode;
  /** Render prop: call `close` from an item's onClick. */
  children: (close: () => void) => ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={buttonClassName({ variant: 'ghost', size: 'sm', className: 'aria-expanded:bg-surface-2 aria-expanded:text-fg' })}
      >
        {icon}
        <span className="max-w-40 truncate">{label}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div
          id={id}
          className="absolute end-0 top-full z-50 mt-2 flex min-w-56 animate-enter flex-col rounded-md border border-border bg-surface p-1 shadow"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** One row of a Menu: 40px tall, icon then label. */
export const menuItemClass =
  'flex h-10 w-full items-center gap-3 rounded-sm px-3 text-start text-sm text-fg transition-colors hover:bg-surface-2 aria-[current=page]:font-medium aria-[current=page]:text-brand-text';
