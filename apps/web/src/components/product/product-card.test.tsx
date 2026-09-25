import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { SearchHit } from '@/types/search.types';
import { ProductCard } from './product-card';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/lib/hooks/use-watchlist', () => ({
  useIsWatched: () => false,
  useToggleWatchlist: () => ({ mutate: vi.fn(), isPending: false }),
}));

function hit(title: string): SearchHit {
  return {
    id: 'p1',
    slug: 'p1',
    categoryId: 'c1',
    category: { id: 'c1', slug: 'smartphones', name: 'Smartphones', parentId: null, level: 1 },
    title,
    brand: 'Brand',
    model: null,
    gtin: null,
    upc: null,
    ean: null,
    mpn: null,
    attributes: {},
    imageUrl: null,
    thumbnailUrl: null,
    tier: 'MID_RANGE',
    isVerified: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    priceStats: { min: 100, max: 100, avg: 100, median: 100, current: 100, currency: 'EGP' },
    minPriceUsd: 100,
    maxPriceUsd: 100,
    listingCount: 1,
    storeCount: 1,
  };
}

describe('ProductCard', () => {
  afterEach(cleanup);

  it('renders a store-supplied title as text, never as HTML', () => {
    const title = 'Phone <img src=x onerror="alert(1)"> 128GB';
    const { container } = render(<ProductCard product={hit(title)} />);
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe(title);
    expect(container.querySelector('h3 img')).toBeNull();
  });
});
