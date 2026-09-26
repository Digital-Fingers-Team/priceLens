import * as React from 'react';
import { cn } from '@/lib/utils/cn';

/** Horizontal scroll inside the parent card; never the whole page. */
export function Table({ className, wide, ...props }: React.TableHTMLAttributes<HTMLTableElement> & { wide?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-sm', wide ? 'min-w-table-lg' : 'min-w-table', className)} {...props} />
    </div>
  );
}

export function THead(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="border-b border-border" {...props} />;
}

export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className="divide-y divide-border" {...props} />;
}

type Align = 'start' | 'end';

export function Th({ align = 'start', className, ...props }: Omit<React.ThHTMLAttributes<HTMLTableCellElement>, 'align'> & { align?: Align }) {
  return (
    <th
      scope="col"
      className={cn('label-mono px-4 py-2 font-medium text-muted sm:px-6', align === 'end' ? 'text-end' : 'text-start', className)}
      {...props}
    />
  );
}

export function Td({ align = 'start', className, ...props }: Omit<React.TdHTMLAttributes<HTMLTableCellElement>, 'align'> & { align?: Align }) {
  return (
    <td
      className={cn('px-4 py-3 text-fg sm:px-6', align === 'end' ? 'text-end tabular-nums' : 'text-start', className)}
      {...props}
    />
  );
}
