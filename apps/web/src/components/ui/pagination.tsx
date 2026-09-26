'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils/cn';
import { iconButtonClassName } from './button-styles';

/** 1 … 4 5 6 … 20: first, last, and the current page's neighbours. */
export function pageWindow(page: number, total: number): (number | 'gap')[] {
  const pages = new Set([1, total, page - 1, page, page + 1].filter((n) => n >= 1 && n <= total));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push('gap');
    out.push(n);
  });
  return out;
}

interface PaginationProps {
  page: number;
  totalPages: number;
  /** Real links, so pages can be opened in a new tab and crawled. */
  hrefFor: (page: number) => string;
  className?: string;
}

export function Pagination({ page, totalPages, hrefFor, className }: PaginationProps) {
  const { t, tf } = useI18n();
  if (totalPages <= 1) return null;

  const step = (target: number, label: string, icon: React.ReactNode) =>
    target >= 1 && target <= totalPages ? (
      <Link href={hrefFor(target)} scroll aria-label={label} className={iconButtonClassName({ variant: 'secondary' })}>
        {icon}
      </Link>
    ) : (
      <span aria-disabled="true" className={iconButtonClassName({ variant: 'secondary' })}>
        {icon}
      </span>
    );

  return (
    <nav aria-label={tf(t.common.pageOf, { page, total: totalPages })} className={cn('flex items-center justify-center gap-1', className)}>
      {step(page - 1, t.common.previousPage, <ChevronLeft className="flip-rtl h-4 w-4" />)}
      <ul className="flex items-center gap-1">
        {pageWindow(page, totalPages).map((n, i) =>
          n === 'gap' ? (
            <li key={`gap-${i}`} aria-hidden className="w-6 text-center font-mono text-xs text-muted">
              …
            </li>
          ) : (
            <li key={n}>
              <Link
                href={hrefFor(n)}
                aria-label={tf(t.common.page, { page: n })}
                aria-current={n === page ? 'page' : undefined}
                className={iconButtonClassName({
                  variant: n === page ? 'primary' : 'ghost',
                  className: 'normal-case tracking-normal',
                })}
              >
                {n}
              </Link>
            </li>
          ),
        )}
      </ul>
      {step(page + 1, t.common.nextPage, <ChevronRight className="flip-rtl h-4 w-4" />)}
    </nav>
  );
}
