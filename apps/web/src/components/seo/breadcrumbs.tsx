import { ChevronRight } from 'lucide-react';
import { Link } from '@/lib/i18n/navigation';

export interface Crumb {
  label: string;
  /** Omitted for the current page (the last crumb). */
  href?: string;
}

/**
 * Where this page sits: Home > Category > Product (audit 09, SEO-07). The
 * same trail goes out as BreadcrumbList JSON-LD (lib/structured-data.ts).
 */
export function Breadcrumbs({ items, label }: { items: Crumb[]; label: string }) {
  return (
    <nav aria-label={label}>
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
        {items.map((item, i) => (
          <li key={`${i}-${item.label}`} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="flip-rtl h-4 w-4 shrink-0" aria-hidden />}
            {item.href ? (
              <Link href={item.href} className="transition-colors hover:text-fg">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" dir="auto" className="line-clamp-1 text-fg">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
