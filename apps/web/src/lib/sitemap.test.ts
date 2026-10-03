import { beforeEach, describe, expect, it, vi } from 'vitest';

const { search } = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('@/lib/api/search.api', () => ({ searchApi: { search } }));
vi.mock('@/lib/api/categories.api', () => ({
  categoriesApi: { list: async () => [{ slug: 'phones', productCount: 3 }, { slug: 'empty', productCount: 0 }] },
}));

import { PRODUCTS_PER_FILE, indexXml, pageEntries, productEntries, productFileCount, urlsetXml } from './sitemap';

/** A catalogue of `total` products served by page, counting requests in flight. */
function catalogue(total: number) {
  let inFlight = 0;
  let maxInFlight = 0;
  search.mockImplementation(async ({ page, limit }: { page: number; limit: number }) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 2));
    inFlight -= 1;
    const start = (page - 1) * limit;
    const count = Math.max(0, Math.min(limit, total - start));
    return { total, hits: Array.from({ length: count }, (_, i) => ({ slug: `p${start + i}`, updatedAt: null })) };
  });
  return { maxInFlight: () => maxInFlight };
}

describe('sitemap', () => {
  beforeEach(() => {
    search.mockReset();
  });

  it('splits the catalogue into files of PRODUCTS_PER_FILE products', async () => {
    catalogue(PRODUCTS_PER_FILE * 2 + 10);
    expect(await productFileCount()).toBe(3);

    const second = await productEntries(2);
    expect(second).toHaveLength(PRODUCTS_PER_FILE * 2); // both languages
    expect(second[0].url).toContain(`/products/p${PRODUCTS_PER_FILE}`);
    expect(await productEntries(3)).toHaveLength(20);
  });

  // Prod build, 2026-09-29: pages one after another took over Next's 60-second limit.
  it('fetches a file\'s pages several at a time and stops after the last page', async () => {
    const stats = catalogue(150);
    expect(await productEntries(1)).toHaveLength(300);
    expect(stats.maxInFlight()).toBeGreaterThan(1);
    const pages = search.mock.calls.map(([args]) => (args as { page: number }).page);
    expect(Math.max(...pages)).toBeLessThanOrEqual(8);
  });

  it('lists static pages and only categories with products', async () => {
    const urls = (await pageEntries()).map((entry) => entry.url);
    expect(urls.some((url) => url.endsWith('/categories/phones'))).toBe(true);
    expect(urls.some((url) => url.includes('/categories/empty'))).toBe(false);
  });

  it('writes escaped XML with hreflang alternates, and an index of absolute file URLs', async () => {
    const xml = urlsetXml([
      { url: 'https://x.test/a?b=1&c=2', lastModified: new Date(0), changeFrequency: 'daily', priority: 0.6, languages: { en: 'https://x.test/en/a' } },
    ]);
    expect(xml).toContain('<loc>https://x.test/a?b=1&amp;c=2</loc>');
    expect(xml).toContain('hreflang="en" href="https://x.test/en/a"');
    expect(indexXml(['pages.xml', 'products-1.xml'])).toMatch(/<sitemap><loc>https?:\/\/[^<]+\/sitemaps\/products-1\.xml<\/loc>/);
  });
});
