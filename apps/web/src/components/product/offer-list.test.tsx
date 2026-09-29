import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderWithI18n as render } from '@/test/i18n';
import { OfferList } from './offer-list';
import type { SourceListing } from '@/types/product.types';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/products/galaxy-a57',
}));

/** The address the component reads its color from (after mount). */
const setQuery = (query: string) => window.history.replaceState(null, '', `/products/galaxy-a57${query ? `?${query}` : ''}`);

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

const offers = [
  listing({ id: 'a', platform: store('p1', 'Jumia'), priceUsd: 390, rawPrice: 18999, color: 'navy' }),
  // Cheaper but sold out: never the Best Deal, listed last.
  listing({ id: 'b', platform: store('p2', 'Noon'), priceUsd: 350, rawPrice: 17000, inStock: false, color: 'navy' }),
  listing({ id: 'c', platform: store('p3', 'Amazon'), priceUsd: 370, rawPrice: 18000, color: 'lilac' }),
];

const rowNames = () => screen.getAllByRole('listitem').map((li) => within(li).getAllByText(/^(Jumia|Noon|Amazon)$/)[0].textContent);

describe('OfferList', () => {
  beforeEach(() => {
    setQuery('');
    replace.mockReset();
  });
  afterEach(cleanup);

  it('shows an empty state instead of an empty list', () => {
    render(<OfferList listings={[]} />);
    expect(screen.getByText('No store has this product listed right now.')).toBeTruthy();
  });

  it('lists the cheapest buyable offer first, as Best Deal, and sold-out offers last', () => {
    render(<OfferList listings={offers} />);
    expect(rowNames()).toEqual(['Amazon', 'Jumia', 'Noon']);
    const [first, , last] = screen.getAllByRole('listitem');
    expect(within(first).getByText('Best deal')).toBeTruthy();
    expect(within(last).queryByText('Best deal')).toBeNull();
    expect(within(last).getByText('Out of stock')).toBeTruthy();
    expect(first.textContent).toMatch(/EGP|E£/);
  });

  it('links to each store through the click-recording redirect, in a new tab (D-21)', () => {
    render(<OfferList listings={[offers[0]]} />);
    const link = screen.getByRole('link', { name: 'Go to Jumia (opens in a new tab)' });
    expect(link.getAttribute('href')).toBe('/api/v1/affiliate/go/a');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('sponsored');
    expect(link.textContent).toContain('Go to Jumia');
  });

  it('refuses a non-http store URL', () => {
    render(<OfferList listings={[listing({ externalUrl: 'javascript:alert(1)' })]} />);
    expect(screen.queryByRole('link', { name: /Go to Jumia/ })).toBeNull();
    expect(screen.getByText('Link unavailable')).toBeTruthy();
  });

  it('offers a color filter when offers name two or more colors, and writes it to the URL', () => {
    render(<OfferList listings={offers} />);
    fireEvent.click(screen.getByRole('button', { name: 'lilac' }));
    expect(replace).toHaveBeenCalledWith('/en/products/galaxy-a57?color=lilac', { scroll: false });
    expect(rowNames()).toEqual(['Amazon']);
  });

  it('with a color in the URL, shows only that color and picks Best Deal among it', () => {
    setQuery('color=navy');
    render(<OfferList listings={offers} />);
    expect(rowNames()).toEqual(['Jumia', 'Noon']);
    expect(within(screen.getAllByRole('listitem')[0]).getByText('Best deal')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'navy' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('has no color filter when there is only one color', () => {
    render(<OfferList listings={[offers[0]]} />);
    expect(screen.queryByRole('group', { name: 'Filter offers by color' })).toBeNull();
  });
});

describe('OfferList in Arabic', () => {
  afterEach(cleanup);

  it('uses the Arabic copy and keeps the store names as they are', () => {
    setQuery('');
    render(<OfferList listings={offers} />, 'ar');
    expect(screen.getAllByText('أفضل صفقة').length).toBe(1);
    expect(screen.getByRole('link', { name: 'اذهب إلى Amazon (يفتح في علامة تبويب جديدة)' })).toBeTruthy();
    expect(screen.getByText('غير متوفر')).toBeTruthy();
  });
});
