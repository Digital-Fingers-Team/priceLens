'use client';
import { createContext, useContext, useMemo } from 'react';
import { formattersFor } from '@/lib/utils/format';
import { localeDir, localizePath, type Locale } from './config';
import type { Dictionary } from './dictionaries';
import { interpolate, plural, type PluralForms } from './format';

interface I18nValue {
  locale: Locale;
  dict: Dictionary;
}

const I18nContext = createContext<I18nValue | null>(null);

/** Set once by the [locale] layout; the dictionary comes from the server. */
export function I18nProvider({ locale, dict, children }: I18nValue & { children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, dict }), [locale, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n() outside <I18nProvider>');
  const { locale, dict } = context;
  return useMemo(
    () => ({
      locale,
      dir: localeDir(locale),
      t: dict,
      fmt: formattersFor(locale),
      /** Fill `{name}` placeholders. */
      tf: interpolate,
      /** Pick the plural form for `count` and fill placeholders. */
      tp: (forms: PluralForms, count: number, vars?: Record<string, string | number>) => plural(locale, forms, count, vars),
      /** An internal path in the current locale. */
      href: (path: string) => localizePath(locale, path),
    }),
    [locale, dict],
  );
}
