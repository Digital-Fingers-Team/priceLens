import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';
import { searchApi } from '@/lib/api/search.api';

const ROUTES = ['/', '/search', '/collections', '/watchlist'];

// Google caps a single sitemap at 50k URLs; the catalogue is well under that,
// but the crawl still has to be paid for page by page, so it is fetched in
// batches rather than asked for in one enormous response.
// 100 is the API ceiling -- ask for more and it silently returns 100, which
// then reads as a short final page and ends the loop after one batch.
const PAGE_SIZE = 100;
const MAX_PRODUCTS = 10000;

export const revalidate = 21600; // six hours

async function productRoutes(): Promise<MetadataRoute.Sitemap> {
  const urls: MetadataRoute.Sitemap = [];

  for (let page = 1; urls.length < MAX_PRODUCTS; page += 1) {
    let hits;
    try {
      // An empty query is the catalogue in relevance order -- the same call the
      // search page makes with no filters.
      const res = await searchApi.search({ q: '', page, limit: PAGE_SIZE });
      hits = res.hits;
    } catch {
      // A sitemap that lists the static pages beats a 500 that lists nothing:
      // Google drops the whole file on an error, including the routes that
      // were fine.
      break;
    }
    if (!hits?.length) break;

    for (const hit of hits) {
      if (!hit.slug) continue;
      urls.push({
        url: absoluteUrl(`/products/${hit.slug}`),
        lastModified: hit.updatedAt ? new Date(hit.updatedAt) : new Date(),
        changeFrequency: 'daily',
        // Prices move daily and that is the reason to recrawl, but a single
        // product is still less important than the entry points above.
        priority: 0.6,
      });
    }

    if (hits.length < PAGE_SIZE) break;
  }

  return urls;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = ROUTES.map((route) => ({
    url: absoluteUrl(route),
    lastModified: new Date(),
    changeFrequency: route === '/' ? 'daily' : 'weekly',
    priority: route === '/' ? 1 : 0.7,
  }));

  return [...staticRoutes, ...(await productRoutes())];
}
