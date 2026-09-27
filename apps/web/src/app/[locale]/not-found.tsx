'use client';
import { SearchBar } from '@/components/search/search-bar';
import { buttonClassName } from '@/components/ui/button-styles';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';

// Client: not-found receives no params, and the locale comes from the
// provider the [locale] layout set up.
export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex max-w-page flex-col items-start gap-6 px-4 py-24 sm:px-6">
      <p className="label-mono text-brand">404</p>
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="text-2xl font-semibold text-fg">{t.errors.notFoundTitle}</h1>
        <p className="text-base text-muted">{t.errors.notFoundBody}</p>
      </div>
      {/* Search right here: most 404s are an old product link (audit 09, SEO-13). */}
      <SearchBar className="w-full max-w-xl" />
      <div className="flex flex-wrap gap-2">
        <Link href="/search" className={buttonClassName({ variant: 'primary' })}>
          {t.errors.searchProducts}
        </Link>
        <Link href="/" className={buttonClassName({ variant: 'secondary' })}>
          {t.errors.goHome}
        </Link>
      </div>
    </div>
  );
}
