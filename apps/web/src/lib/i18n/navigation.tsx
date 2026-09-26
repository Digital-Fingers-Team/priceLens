'use client';
import NextLink from 'next/link';
import {
  usePathname as useNextPathname,
  useRouter as useNextRouter,
} from 'next/navigation';
import { forwardRef, useMemo, type ComponentProps } from 'react';
import { localizePath, splitLocale } from './config';
import { useI18n } from './provider';

/**
 * Locale-aware drop-ins for next/link and next/navigation (audit 07). Pages
 * keep writing `/search`; in the Arabic UI these become `/ar/search`.
 */
export const Link = forwardRef<HTMLAnchorElement, ComponentProps<typeof NextLink>>(function Link(
  { href, ...props },
  ref,
) {
  const { locale } = useI18n();
  const localized = typeof href === 'string' ? localizePath(locale, href) : href;
  return <NextLink ref={ref} href={localized} {...props} />;
});

export function useRouter() {
  const router = useNextRouter();
  const { locale } = useI18n();
  return useMemo(
    () => ({
      ...router,
      // Options only when given: callers (and tests) see the same call as
      // with next/navigation's router.
      push: (href: string, options?: Parameters<typeof router.push>[1]) =>
        options ? router.push(localizePath(locale, href), options) : router.push(localizePath(locale, href)),
      replace: (href: string, options?: Parameters<typeof router.replace>[1]) =>
        options ? router.replace(localizePath(locale, href), options) : router.replace(localizePath(locale, href)),
      prefetch: (href: string) => router.prefetch(localizePath(locale, href)),
    }),
    [router, locale],
  );
}

/** The current path without the locale prefix (`/ar/search` -> `/search`). */
export function usePathname(): string {
  return splitLocale(useNextPathname() ?? '/').path;
}
