/**
 * What a tracked path is: the kind of page and, for product, category and
 * search pages, which one. Worked out here rather than trusted from the
 * browser, so the dashboard's groups cannot be polluted by a crafted beacon.
 */
export interface PagePath {
  path: string;
  route: 'home' | 'product' | 'category' | 'search' | 'account' | 'other';
  locale: 'ar' | 'en';
  productSlug: string | null;
  categorySlug: string | null;
  searchQuery: string | null;
}

const ACCOUNT_PAGES = new Set(['login', 'register', 'watchlist', 'alerts', 'account', 'settings', 'notifications']);

/** null for pages that are not counted (admin). */
export function parsePagePath(raw: string): PagePath | null {
  let url: URL;
  try {
    url = new URL(raw, 'https://x.invalid');
  } catch {
    return null;
  }
  const parts = url.pathname.split('/').filter(Boolean).map(safeDecode);
  // Arabic is the default and has no prefix; English lives under /en (/ar redirects).
  let locale: PagePath['locale'] = 'ar';
  if (parts[0] === 'en' || parts[0] === 'ar') locale = parts.shift() as PagePath['locale'];
  if (parts[0] === 'admin') return null;

  const base = { path: url.pathname.slice(0, 512), locale, productSlug: null, categorySlug: null, searchQuery: null };
  if (parts.length === 0) return { ...base, route: 'home' };
  if (parts[0] === 'products' && parts[1]) return { ...base, route: 'product', productSlug: parts[1].slice(0, 255) };
  if (parts[0] === 'categories' && parts[1]) return { ...base, route: 'category', categorySlug: parts[1].slice(0, 255) };
  if (parts[0] === 'search') {
    const q = (url.searchParams.get('q') ?? '').trim().replace(/\s+/g, ' ').slice(0, 200);
    return { ...base, route: 'search', searchQuery: q || null };
  }
  if (ACCOUNT_PAGES.has(parts[0])) return { ...base, route: 'account' };
  return { ...base, route: 'other' };
}

function safeDecode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/**
 * Crawlers, headless browsers, AI agents and HTTP libraries; they are not
 * visitors. Also used for store clicks: on 2026-10-10, 4,708 of 4,822 weekly
 * clicks came from one crawler (ShapBot) following the store links.
 */
export const BOT_USER_AGENT =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|monitor|gpt|claude|perplexity|python|curl|wget|go-http|axios|node-fetch|okhttp|java\//i;

/** True for a missing user agent or one that names a bot. */
export function isBotUserAgent(userAgent: string | undefined | null): boolean {
  return !userAgent || BOT_USER_AGENT.test(userAgent);
}

export function deviceOf(userAgent: string | undefined): 'mobile' | 'desktop' {
  return /mobi|android|iphone|ipad/i.test(userAgent ?? '') ? 'mobile' : 'desktop';
}

/** The referring site's host, or null for internal and missing referrers. */
export function referrerHost(referrer: string | undefined, ownHost: string | undefined): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '').slice(0, 255);
    return host && host !== ownHost?.replace(/^www\./, '').split(':')[0] ? host : null;
  } catch {
    return null;
  }
}
