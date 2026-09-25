import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SearchBar } from './search-bar';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const suggest = vi.fn();
vi.mock('@/lib/api/search.api', () => ({ searchApi: { suggest: (q: string) => suggest(q) } }));

function renderSearchBar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SearchBar />
    </QueryClientProvider>,
  );
}

const input = () => screen.getByPlaceholderText('Search products, brands, models...');

describe('SearchBar', () => {
  beforeEach(() => {
    push.mockReset();
    suggest.mockReset().mockResolvedValue([]);
  });
  afterEach(cleanup);

  it('submits the trimmed query to the search page, URL-encoded', () => {
    renderSearchBar();
    fireEvent.change(input(), { target: { value: '  iphone 15 & case ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(push).toHaveBeenCalledWith('/search?q=iphone%2015%20%26%20case');
  });

  it('does not navigate for a blank query', () => {
    renderSearchBar();
    fireEvent.change(input(), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(push).not.toHaveBeenCalled();
  });

  it('shows suggestions and opens the chosen product', async () => {
    suggest.mockResolvedValue([
      { id: 'p1', title: 'Samsung Galaxy A57 256GB', slug: 'samsung-galaxy-a57-256gb', brand: 'Samsung' },
    ]);
    renderSearchBar();
    fireEvent.change(input(), { target: { value: 'galaxy' } });

    fireEvent.click(await screen.findByText('Samsung Galaxy A57 256GB'));
    expect(suggest).toHaveBeenCalledWith('galaxy');
    expect(push).toHaveBeenCalledWith('/products/samsung-galaxy-a57-256gb');
  });
});
