import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithI18n } from '@/test/i18n';
import { SearchFilters } from './search-filters';
import { useSearchStore } from '@/lib/store/search.store';
import { parseSearchParams } from '@/lib/search-url';

vi.mock('@/lib/api/categories.api', () => ({
  categoriesApi: {
    list: async () => [
      { id: 'c-tv', slug: 'televisions', name: 'TVs', parentId: null, level: 1, productCount: 3 },
      { id: 'c-phone', slug: 'smartphones', name: 'Smartphones', parentId: null, level: 1, productCount: 9 },
    ],
  },
}));

const applied = parseSearchParams(new URLSearchParams('q=tv&brand=LG'));

function render(ui: React.ReactElement, locale: 'en' | 'ar' = 'en') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithI18n(<QueryClientProvider client={client}>{ui}</QueryClientProvider>, locale);
}

// jsdom has no matchMedia, so these run the phone layout: the bottom sheet.
describe('SearchFilters', () => {
  beforeEach(() => useSearchStore.setState({ isFilterPanelOpen: false }));
  afterEach(cleanup);

  it('shows how many filters are applied while collapsed', () => {
    render(<SearchFilters applied={applied} onApply={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Filters/ }).textContent).toContain('1');
  });

  it('applies the draft only on Apply', () => {
    const onApply = vi.fn();
    render(<SearchFilters applied={applied} onApply={onApply} />);
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));

    fireEvent.change(screen.getByLabelText('Max price'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Tier'), { target: { value: 'PREMIUM' } });
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ brand: 'LG', maxPrice: 500, tier: 'PREMIUM' }));
    // The sheet closes.
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('filters by category from a list of names, not a raw id (D-24)', async () => {
    const onApply = vi.fn();
    render(<SearchFilters applied={applied} onApply={onApply} />);
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    expect(screen.queryByLabelText('Category ID')).toBeNull();
    expect(screen.queryByLabelText('Sort by')).toBeNull();

    await screen.findByRole('option', { name: 'Smartphones' });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'c-phone' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'c-phone' }));
  });

  it('names categories in Arabic from the dictionary', async () => {
    render(<SearchFilters applied={applied} onApply={vi.fn()} />, 'ar');
    fireEvent.click(screen.getByRole('button', { name: /التصفية/ }));
    expect(await screen.findByRole('option', { name: 'هواتف ذكية' })).toBeTruthy();
  });

  it('closing without applying leaves the results alone', () => {
    const onApply = vi.fn();
    render(<SearchFilters applied={applied} onApply={onApply} />);
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    fireEvent.change(screen.getByLabelText('Brand'), { target: { value: 'Sony' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onApply).not.toHaveBeenCalled();
  });
});
