import { describe, expect, it } from 'vitest';
import { localizePath, splitLocale } from './config';
import { dictionaries } from './dictionaries';
import { interpolate, plural } from './format';
import { formatCurrency, formatRelativeTime } from '@/lib/utils/format';

describe('locale paths', () => {
  it('keeps English un-prefixed and prefixes Arabic', () => {
    expect(localizePath('en', '/search?q=tv')).toBe('/search?q=tv');
    expect(localizePath('ar', '/search?q=tv')).toBe('/ar/search?q=tv');
    expect(localizePath('ar', '/')).toBe('/ar');
    expect(localizePath('ar', '/?q=x')).toBe('/ar?q=x');
  });

  it('leaves external, protocol-relative and already-prefixed links alone', () => {
    expect(localizePath('ar', 'https://noon.com/x')).toBe('https://noon.com/x');
    expect(localizePath('ar', '//evil.example')).toBe('//evil.example');
    expect(localizePath('ar', '/ar/search')).toBe('/ar/search');
    expect(localizePath('ar', '#offers')).toBe('#offers');
  });

  it('splits the locale off a path', () => {
    expect(splitLocale('/ar/products/x')).toEqual({ locale: 'ar', path: '/products/x' });
    expect(splitLocale('/ar')).toEqual({ locale: 'ar', path: '/' });
    expect(splitLocale('/search')).toEqual({ locale: 'en', path: '/search' });
    // Not a locale: "/area" starts with "ar" but is a path.
    expect(splitLocale('/area')).toEqual({ locale: 'en', path: '/area' });
  });
});

describe('copy helpers', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(interpolate('Go to {store}', { store: 'Noon' })).toBe('Go to Noon');
    expect(interpolate('{a} {b}', { a: 1 })).toBe('1 {b}');
  });

  it('picks Arabic plural forms', () => {
    const forms = dictionaries.ar.search.productCount;
    expect(plural('ar', forms, 1)).toBe('منتج واحد');
    expect(plural('ar', forms, 2)).toBe('منتجان');
    expect(plural('ar', forms, 5)).toBe('5 منتجات');
    expect(plural('ar', forms, 11)).toBe('11 منتجًا');
    expect(plural('ar', forms, 100)).toBe('100 منتج');
    expect(plural('en', dictionaries.en.search.productCount, 1)).toBe('1 product');
    expect(plural('en', dictionaries.en.search.productCount, 1200)).toBe('1,200 products');
  });

  it('formats prices with Western digits in Arabic', () => {
    expect(formatCurrency(16721.5, 'EGP', 'ar')).toMatch(/16,721\.50/);
    expect(formatRelativeTime(new Date(Date.now() - 3 * 3600_000).toISOString(), 'ar')).toContain('3');
  });
});

/** Every string leaf with its path. */
function leaves(value: unknown, at = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[at, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${at}[${i}]`));
  return Object.entries(value as object).flatMap(([k, v]) => leaves(v, at ? `${at}.${k}` : k));
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((p) => p !== 'count').sort();

describe('dictionaries', () => {
  const en = new Map(leaves(dictionaries.en));
  const ar = new Map(leaves(dictionaries.ar));

  it('Arabic has no empty strings', () => {
    expect([...ar].filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
  });

  it('Arabic uses the same placeholders as English', () => {
    const mismatched = [...en]
      .filter(([k]) => ar.has(k))
      .filter(([k, v]) => placeholders(v).join() !== placeholders(ar.get(k)!).join())
      .map(([k]) => k);
    expect(mismatched).toEqual([]);
  });

  it('every English key exists in Arabic (plural forms aside)', () => {
    const plural = /\.(zero|one|two|few|many|other)$/;
    const missing = [...en.keys()].filter((k) => !plural.test(k) && !ar.has(k));
    expect(missing).toEqual([]);
  });
});
