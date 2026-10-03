'use client';
import { Wordmark } from '@/components/brand/logo';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';

const linkClass = 'text-sm text-muted transition-colors hover:text-fg';

export function Footer() {
  const { t, tf } = useI18n();
  const columns = [
    {
      title: t.footer.shoppers,
      links: [
        { href: '/search', label: t.footer.browse },
        { href: '/deal-hunter', label: t.nav.dealHunter },
        { href: '/watchlist', label: t.nav.watchlist },
      ],
    },
    {
      title: t.footer.sellers,
      links: [
        { href: '/seller', label: t.nav.seller },
        { href: '/pricing', label: t.nav.pricing },
        { href: '/developers', label: t.footer.developers },
      ],
    },
  ];

  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto grid max-w-page grid-cols-1 gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div className="flex flex-col gap-3 sm:col-span-2">
          <Link href="/" aria-label={t.nav.home} className="w-fit text-brand-text">
            <Wordmark className="h-7 w-auto" />
          </Link>
          <p className="max-w-sm text-pretty text-sm text-muted">{t.footer.tagline}</p>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title} className="flex flex-col gap-3">
            <h2 className="label-mono text-fg">{column.title}</h2>
            <ul className="flex flex-col gap-2">
              {column.links.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className={linkClass}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-page px-4 py-6 text-xs text-muted sm:px-6">
          {tf(t.footer.copyright, { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}
