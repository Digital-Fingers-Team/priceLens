import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { ListingTable } from './listing-table';
import type { SourceListing } from '@/types/product.types';

function store(id: string, name: string): SourceListing['platform'] {
  return { id, name, slug: name.toLowerCase(), logoUrl: null, baseUrl: `https://${name.toLowerCase()}.example` };
}

function listing(overrides: Partial<SourceListing>): SourceListing {
  return {
    id: 'l1',
    platformId: 'p1',
    platform: store('p1', 'Jumia'),
    externalId: 'x1',
    externalUrl: 'https://www.jumia.com.eg/item-1.html',
    rawTitle: 'Samsung Galaxy A57 256GB/8GB Navy',
    rawPrice: 18999,
    rawCurrency: 'EGP',
    rawImageUrl: null,
    priceUsd: 390,
    inStock: true,
    color: 'navy',
    rating: null,
    reviewCount: null,
    matchStatus: 'ACCEPTED',
    matchConfidence: 0.93,
    firstSeenAt: '2026-09-20T00:00:00Z',
    lastSeenAt: '2026-09-26T00:00:00Z',
    lastScrapedAt: '2026-09-26T00:00:00Z',
    ...overrides,
  };
}

describe('ListingTable', () => {
  afterEach(cleanup);

  it('shows an empty state instead of an empty table', () => {
    render(<ListingTable listings={[]} />);
    expect(screen.getByText('No store listings available yet.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows each store its own price and currency, and the cheapest buyable offer as Best Deal', () => {
    render(
      <ListingTable
        listings={[
          listing({ id: 'a', platform: store('p1', 'Jumia'), priceUsd: 390, rawPrice: 18999 }),
          // Cheaper but sold out: must not be the Best Deal.
          listing({ id: 'b', platform: store('p2', 'Noon'), priceUsd: 350, rawPrice: 17000, inStock: false }),
        ]}
      />,
    );
    const rows = screen.getAllByRole('row').slice(1);
    const jumia = rows.find((r) => within(r).queryByText('Jumia'))!;
    const noon = rows.find((r) => within(r).queryByText('Noon'))!;
    expect(within(jumia).getByText('Best Deal')).toBeTruthy();
    expect(within(noon).queryByText('Best Deal')).toBeNull();
    expect(jumia.textContent).toMatch(/EGP|E£/);
    expect(within(noon).getByRole('img', { name: 'Out of stock' })).toBeTruthy();
  });

  it('links to the store in a new tab, with a name that says which store', () => {
    render(<ListingTable listings={[listing({})]} />);
    const link = screen.getByRole('link', { name: 'View on Jumia (opens in a new tab)' });
    expect(link.getAttribute('href')).toBe('https://www.jumia.com.eg/item-1.html');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('refuses a non-http store URL', () => {
    render(<ListingTable listings={[listing({ externalUrl: 'javascript:alert(1)' })]} />);
    // No href at all: the anchor is no longer a link anyone can activate.
    expect(screen.queryByRole('link', { name: /View on Jumia/ })).toBeNull();
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
  });
});
