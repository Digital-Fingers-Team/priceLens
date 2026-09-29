/**
 * Locales (audit 07, UI-04). Arabic is the default (owner, 2026-09-29): it
 * has the un-prefixed URLs and English lives under /en. middleware.ts
 * rewrites un-prefixed paths to the [locale] segment, so every page renders
 * with a known locale and stays static.
 */
export const locales = ['en', 'ar'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ar';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

export function localeDir(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/**
 * Intl locale for numbers and dates. Arabic keeps Western digits, as the
 * Egyptian stores themselves print prices (owner can switch to `ar-EG`).
 */
export function intlLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US';
}

/**
 * `/ar/search` -> { locale: 'ar', path: '/search' }; `/search` -> en. `/en/...` is
 * English too: pages built ahead of time report their route path
 * (`/en/pricing`), and the language switch then linked to `/ar/en/pricing`
 * (a 404, found by the audit 09 crawl).
 */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const match = /^\/([a-z]{2})(?=\/|$)(.*)$/.exec(pathname);
  if (match && isLocale(match[1])) {
    return { locale: match[1], path: match[2] || '/' };
  }
  return { locale: defaultLocale, path: pathname || '/' };
}

/**
 * An internal path for a locale: `/search?q=tv` -> `/ar/search?q=tv`.
 * Anything that is not a site-absolute path (external URLs, `#hash`, `?q`)
 * is returned unchanged, as is a path that already carries the prefix.
 */
export function localizePath(locale: Locale, href: string): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  if (locale === defaultLocale) return href;
  if (href === `/${locale}` || href.startsWith(`/${locale}/`) || href.startsWith(`/${locale}?`)) return href;
  return href === '/' ? `/${locale}` : `/${locale}${href.startsWith('/?') ? href.slice(1) : href}`;
}
