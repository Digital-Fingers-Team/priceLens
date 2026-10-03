'use client';
import { Wordmark } from '@/components/brand/logo';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';

export function Footer() {
  const { t, tf } = useI18n();
  const links = [
    { href: '/search', label: t.footer.browse },
    { href: '/watchlist', label: t.nav.watchlist },
    { href: '/pricing', label: t.nav.pricing },
    { href: '/login', label: t.common.signIn },
  ];

  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex max-w-page flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link href="/" aria-label={t.nav.home} className="text-brand-text">
          <Wordmark className="h-6 w-auto" />
        </Link>
        <nav aria-label={t.footer.label} className="flex flex-wrap gap-x-6 gap-y-2">
          {links.map(({ href, label }) => (
            <Link key={href} href={href} className="label-mono text-muted transition-colors hover:text-fg">
              {label}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-muted">{tf(t.footer.copyright, { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}
