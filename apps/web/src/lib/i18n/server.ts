// Server components only: imports both dictionaries.
import { notFound } from 'next/navigation';
import { formattersFor } from '@/lib/utils/format';
import { isLocale, localeDir, localizePath, type Locale } from './config';
import { dictionaries } from './dictionaries';
import { interpolate, plural, type PluralForms } from './format';

/** The [locale] route param, validated (anything else is a 404). */
export async function resolveLocale(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return locale;
}

/** Server components' equivalent of useI18n(). */
export function getI18n(locale: Locale) {
  return {
    locale,
    dir: localeDir(locale),
    t: dictionaries[locale],
    fmt: formattersFor(locale),
    tf: interpolate,
    tp: (forms: PluralForms, count: number, vars?: Record<string, string | number>) => plural(locale, forms, count, vars),
    href: (path: string) => localizePath(locale, path),
  };
}
