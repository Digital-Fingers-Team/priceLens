import { NextResponse, type NextRequest } from 'next/server';
import { defaultLocale, isLocale } from '@/lib/i18n/config';

/**
 * Locale routing (audit 07). The pages live under app/[locale]:
 *  - `/ar/...` is served as is;
 *  - `/en/...` redirects to the un-prefixed URL (one canonical address);
 *  - everything else is English and is rewritten to `/en/...` internally,
 *    so today's URLs do not change.
 * No Accept-Language guessing: a shared link shows the language it names.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const first = pathname.split('/')[1];

  if (first === defaultLocale) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(defaultLocale.length + 1) || '/';
    return NextResponse.redirect(url, 308);
  }
  if (isLocale(first)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/${defaultLocale}${pathname}`;
  url.search = search;
  return NextResponse.rewrite(url);
}

export const config = {
  // Not Next internals, the API proxy, or files (robots.txt, sitemap.xml,
  // images, the manifest): anything with a dot in its last segment.
  // Not English product pages either: next.config.js rewrites those, because
  // Next caches a page (ISR) only when the path it matches is the rewritten
  // one, and a middleware rewrite keeps the original (audit 08, P-06).
  matcher: ['/((?!_next/|api/|products/|.*\\.[^/]*$).*)'],
};
