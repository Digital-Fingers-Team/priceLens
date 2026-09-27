import { defaultLocale, intlLocale, type Locale } from '@/lib/i18n/config';

// Prices are stored as the raw amount scraped from the retailer; every active
// store is Egyptian, so EGP is the display default unless a listing says otherwise.
const DEFAULT_CURRENCY = 'EGP';
const EMPTY = '—';

export function formatCurrency(
  value: number | null | undefined,
  currency: string | null = DEFAULT_CURRENCY,
  locale: Locale = defaultLocale,
): string {
  if (value == null) return EMPTY;
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency: currency ?? DEFAULT_CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(iso: string | null | undefined, locale: Locale = defaultLocale): string {
  if (!iso) return EMPTY;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

/**
 * "5m ago" / "قبل 5 دقائق"; older than 30 days, the date. `now` defaults to the
 * clock; server-rendered pages pass useNow() so hydration sees the same text.
 */
export function formatRelativeTime(
  iso: string | null | undefined,
  locale: Locale = defaultLocale,
  now: number = Date.now(),
): string {
  if (!iso) return EMPTY;
  const mins = Math.floor((now - new Date(iso).getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto', style: 'narrow' });
  if (mins < 1) return rtf.format(0, 'minute');
  if (mins < 60) return rtf.format(-mins, 'minute');
  const hours = Math.floor(mins / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 30) return rtf.format(-days, 'day');
  return formatDate(iso, locale);
}

export function formatNumber(value: number | null | undefined, locale: Locale = defaultLocale): string {
  if (value == null) return EMPTY;
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

export function formatPercent(value: number | null | undefined, locale: Locale = defaultLocale): string {
  if (value == null) return EMPTY;
  return new Intl.NumberFormat(intlLocale(locale), { style: 'percent', maximumFractionDigits: 0 }).format(value / 100);
}

/** "+3.2%" / "-1.5%" (a change; digits stay Western in both UIs), or a dash. */
export function formatSignedPercent(value: number | null | undefined): string {
  if (value == null) return EMPTY;
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function formatRating(value: number | null | undefined): string {
  if (value == null) return EMPTY;
  return value.toFixed(1);
}

/** The formatters bound to one locale (useI18n() hands these out). */
export function formattersFor(locale: Locale) {
  return {
    currency: (value: number | null | undefined, currency?: string | null) => formatCurrency(value, currency, locale),
    date: (iso: string | null | undefined) => formatDate(iso, locale),
    relative: (iso: string | null | undefined, now?: number) => formatRelativeTime(iso, locale, now),
    number: (value: number | null | undefined) => formatNumber(value, locale),
    percent: (value: number | null | undefined) => formatPercent(value, locale),
    rating: formatRating,
  };
}
export type Formatters = ReturnType<typeof formattersFor>;
