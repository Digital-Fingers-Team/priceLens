import { beforeEach, describe, expect, it, vi } from 'vitest';

const { search } = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('@/lib/api/search.api', () => ({ searchApi: { search } }));
vi.mock('@/lib/api/categories.api', () => ({ categoriesApi: { list: async () => [] } }));

import sitemap from './sitemap';

/** A catalogue of `total` products served 100 per page, counting requests in flight. */
function catalogue(total: number) {
  let inFlight = 0;
  let maxInFlight = 0;
  search.mockImplementation(async ({ page, limit }: { page: number; limit: number }) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    const start = (page - 1) * limit;
    const count = Math.max(0, Math.min(limit, total - start));
    return { hits: Array.from({ length: count }, (_, i) => ({ slug: `p${start + i}`, updatedAt: null })) };
  });
  return { maxInFlight: () => maxInFlight };
}

describe('sitemap', () => {
  beforeEach(() => {
    search.mockReset();
  });

  // Prod build, 2026-09-29: ~200 pages one after another took over Next's
  // 60-second limit for a static route and failed the deploy.
  it('fetches the product pages several at a time', async () => {
    const stats = catalogue(1_250);
    const entries = await sitemap();

    const products = entries.filter((entry) => entry.url.includes('/products/'));
    expect(products).toHaveLength(1_250 * 2); // both languages
    expect(stats.maxInFlight()).toBeGreaterThan(1);
  });

  it('stops after the last page', async () => {
    catalogue(150);
    await sitemap();
    const pages = search.mock.calls.map(([args]) => (args as { page: number }).page);
    // Pages past the end may be asked in the same wave, but no further wave follows.
    expect(Math.max(...pages)).toBeLessThanOrEqual(8);
  });
});
