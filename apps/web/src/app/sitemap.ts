import type { MetadataRoute } from 'next';
import { categoriesApi } from '@/lib/api/categories.api';
import { searchApi } from '@/lib/api/search.api';
import { defaultLocale, localizePath } from '@/lib/i18n/config';
import { absoluteUrl } from '@/lib/seo';

// Indexable pages only (audit 09, SEO-04, SEO-12): no /watchlist or other
// private pages, no search results (those are noindex).
const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: 'daily' | 'weekly' }> = [
  { path: '/', priority: 1, changeFrequency: 'daily' },
  { path: '/search', priority: 0.7, changeFrequency: 'daily' },
  { path: '/pricing', priority: 0.4, changeFrequency: 'weekly' },
  { path: '/deal-hunter', priority: 0.4, changeFrequency: 'weekly' },
];

// Google caps a single sitemap at 50k URLs and 50 MB. Products with a live
// offer (the browse listing) were ~7k in phase 09 and over 20k by 2026-09-29,
// x2 languages; past 20k products the rest wait for a sitemap index. 100 is the API's page-size ceiling.
const PAGE_SIZE = 100;
const MAX_PRODUCTS = 20000;

export const revalidate = 21600; // six hours

/** Both language versions of a page, each naming the other (hreflang). */
function bothLanguages(
  path: string,
  entry: Omit<MetadataRoute.Sitemap[number], 'url' | 'alternates'>,
): MetadataRoute.Sitemap {
  const languages = {
    en: absoluteUrl(localizePath('en', path)),
    ar: absoluteUrl(localizePath('ar', path)),
    'x-default': absoluteUrl(localizePath(defaultLocale, path)),
  };
  return [
    { ...entry, url: languages.en, alternates: { languages } },
    { ...entry, url: languages.ar, alternates: { languages } },
  ];
}

async function categoryRoutes(): Promise<MetadataRoute.Sitemap> {
  try {
    const categories = await categoriesApi.list();
    return categories
      .filter((category) => category.productCount > 0)
      .flatMap((category) =>
        bothLanguages(`/categories/${category.slug}`, { changeFrequency: 'daily', priority: 0.8, lastModified: new Date() }),
      );
  } catch {
    return [];
  }
}

/**
 * Pages fetched at the same time. One after another, ~200 pages of ~1.5 s
 * each took over Next's 60-second limit for a static route and failed the
 * build (2026-09-29).
 */
const PAGES_AT_ONCE = 8;

async function productPage(page: number) {
  try {
    // An empty query is the catalogue of products with a live offer, the
    // same call the search page makes with no filters.
    return (await searchApi.search({ q: '', page, limit: PAGE_SIZE })).hits ?? [];
  } catch {
    // A sitemap that lists the static pages beats a 500 that lists nothing:
    // Google drops the whole file on an error, including the routes that
    // were fine. An error ends the list like an empty page.
    return null;
  }
}

async function productRoutes(): Promise<MetadataRoute.Sitemap> {
  const urls: MetadataRoute.Sitemap = [];
  let products = 0;

  for (let first = 1; products < MAX_PRODUCTS; first += PAGES_AT_ONCE) {
    const wave = await Promise.all(Array.from({ length: PAGES_AT_ONCE }, (_, i) => productPage(first + i)));
    let ended = false;
    for (const hits of wave) {
      // Pages are taken in order up to the first short, empty or failed one.
      if (!hits?.length) {
        ended = true;
        break;
      }
      for (const hit of hits) {
        if (!hit.slug || products >= MAX_PRODUCTS) continue;
        products += 1;
        urls.push(
          ...bothLanguages(`/products/${hit.slug}`, {
            lastModified: hit.updatedAt ? new Date(hit.updatedAt) : new Date(),
            changeFrequency: 'daily',
            priority: 0.6,
          }),
        );
      }
      if (hits.length < PAGE_SIZE) {
        ended = true;
        break;
      }
    }
    if (ended) break;
  }

  return urls;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = STATIC_ROUTES.flatMap(({ path, priority, changeFrequency }) =>
    bothLanguages(path, { lastModified: new Date(), changeFrequency, priority }),
  );
  const [categories, products] = await Promise.all([categoryRoutes(), productRoutes()]);
  return [...staticRoutes, ...categories, ...products];
}
