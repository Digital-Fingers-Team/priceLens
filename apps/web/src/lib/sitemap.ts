import { categoriesApi } from '@/lib/api/categories.api';
import { searchApi } from '@/lib/api/search.api';
import { defaultLocale, localizePath } from '@/lib/i18n/config';
import { LEGAL_SLUGS } from '@/lib/legal/types';
import { absoluteUrl } from '@/lib/seo';

/**
 * The sitemap, as an index (/sitemap.xml) of small files under /sitemaps/:
 * pages.xml (static pages and categories) and products-<n>.xml. One file
 * held every URL: 40k URLs and 35 MB by 2026-10-03, which Search Console
 * failed to read, and products past 20k were left out to stay under
 * Google's 50k-URL cap. Each product file now holds PRODUCTS_PER_FILE
 * products (x2 languages), well under both caps, and the index grows with
 * the catalogue.
 *
 * Indexable pages only (audit 09, SEO-04, SEO-12): no /watchlist or other
 * private pages, no search results (those are noindex).
 */

export interface SitemapEntry {
  url: string;
  lastModified: Date;
  changeFrequency: 'daily' | 'weekly';
  priority: number;
  /** hreflang -> URL, the same for both language versions of a page. */
  languages: Record<string, string>;
}

const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: 'daily' | 'weekly' }> = [
  { path: '/', priority: 1, changeFrequency: 'daily' },
  { path: '/search', priority: 0.7, changeFrequency: 'daily' },
  { path: '/pricing', priority: 0.4, changeFrequency: 'weekly' },
  { path: '/deal-hunter', priority: 0.4, changeFrequency: 'weekly' },
  ...LEGAL_SLUGS.map((slug) => ({ path: `/legal/${slug}`, priority: 0.2, changeFrequency: 'weekly' as const })),
];

/** 100 is the API's page-size ceiling. */
const PAGE_SIZE = 100;
/** Products per file: 5,000 URLs with both languages, about 4 MB. */
export const PRODUCTS_PER_FILE = 2500;
const PAGES_PER_FILE = PRODUCTS_PER_FILE / PAGE_SIZE;
/**
 * Pages fetched at the same time. One after another, ~200 pages of ~1.5 s
 * each took over Next's 60-second limit and failed the build (2026-09-29).
 */
const PAGES_AT_ONCE = 8;

/** Both language versions of a page, each naming the other (hreflang). */
function bothLanguages(path: string, entry: Omit<SitemapEntry, 'url' | 'languages'>): SitemapEntry[] {
  const languages = {
    en: absoluteUrl(localizePath('en', path)),
    ar: absoluteUrl(localizePath('ar', path)),
    'x-default': absoluteUrl(localizePath(defaultLocale, path)),
  };
  return [
    { ...entry, url: languages.en, languages },
    { ...entry, url: languages.ar, languages },
  ];
}

/** Static pages and every category with products. */
export async function pageEntries(): Promise<SitemapEntry[]> {
  const now = new Date();
  const statics = STATIC_ROUTES.flatMap(({ path, priority, changeFrequency }) =>
    bothLanguages(path, { lastModified: now, changeFrequency, priority }),
  );
  try {
    const categories = await categoriesApi.list();
    return [
      ...statics,
      ...categories
        .filter((category) => category.productCount > 0)
        .flatMap((category) =>
          bothLanguages(`/categories/${category.slug}`, { changeFrequency: 'daily', priority: 0.8, lastModified: now }),
        ),
    ];
  } catch {
    // A sitemap that lists the static pages beats a 500 that lists nothing.
    return statics;
  }
}

/** How many product files the catalogue needs (products with a live offer). */
export async function productFileCount(): Promise<number> {
  try {
    // An empty query is the catalogue of products with a live offer, the
    // same call the search page makes with no filters.
    const { total } = await searchApi.search({ q: '', page: 1, limit: 1 });
    return Math.max(1, Math.ceil(total / PRODUCTS_PER_FILE));
  } catch {
    return 1;
  }
}

async function productPage(page: number) {
  try {
    return (await searchApi.search({ q: '', page, limit: PAGE_SIZE })).hits ?? [];
  } catch {
    // An error ends the file like an empty page: Google drops a whole file
    // that answers with an error.
    return null;
  }
}

/** The products of file `file` (1-based), in the browse order. */
export async function productEntries(file: number): Promise<SitemapEntry[]> {
  const entries: SitemapEntry[] = [];
  const firstPage = (file - 1) * PAGES_PER_FILE + 1;
  const lastPage = file * PAGES_PER_FILE;

  for (let first = firstPage; first <= lastPage; first += PAGES_AT_ONCE) {
    const count = Math.min(PAGES_AT_ONCE, lastPage - first + 1);
    const wave = await Promise.all(Array.from({ length: count }, (_, i) => productPage(first + i)));
    for (const hits of wave) {
      // Pages are taken in order up to the first short, empty or failed one.
      if (!hits?.length) return entries;
      for (const hit of hits) {
        if (!hit.slug) continue;
        entries.push(
          ...bothLanguages(`/products/${hit.slug}`, {
            lastModified: hit.updatedAt ? new Date(hit.updatedAt) : new Date(),
            changeFrequency: 'daily',
            priority: 0.6,
          }),
        );
      }
      if (hits.length < PAGE_SIZE) return entries;
    }
  }
  return entries;
}

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function urlsetXml(entries: SitemapEntry[]): string {
  const urls = entries.map((entry) => {
    const alternates = Object.entries(entry.languages)
      .map(([lang, href]) => `<xhtml:link rel="alternate" hreflang="${lang}" href="${escapeXml(href)}" />`)
      .join('\n');
    return [
      '<url>',
      `<loc>${escapeXml(entry.url)}</loc>`,
      alternates,
      `<lastmod>${entry.lastModified.toISOString()}</lastmod>`,
      `<changefreq>${entry.changeFrequency}</changefreq>`,
      `<priority>${entry.priority}</priority>`,
      '</url>',
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
  ].join('\n');
}

export function indexXml(files: string[]): string {
  const now = new Date().toISOString();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...files.map((file) => `<sitemap><loc>${escapeXml(absoluteUrl(`/sitemaps/${file}`))}</loc><lastmod>${now}</lastmod></sitemap>`),
    '</sitemapindex>',
  ].join('\n');
}

export function xmlResponse(body: string): Response {
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
