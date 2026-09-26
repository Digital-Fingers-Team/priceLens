import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SearchFilters } from './search-filters';
import { useSearchStore } from '@/lib/store/search.store';
import { parseSearchParams } from '@/lib/search-url';

const applied = parseSearchParams(new URLSearchParams('q=tv&brand=LG'));

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
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ brand: 'LG', maxPrice: 500, tier: 'PREMIUM' }),
    );
    // Folds back into the button.
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('has no sort or raw category-id fields (sort lives on the results bar)', () => {
    render(<SearchFilters applied={applied} onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    expect(screen.queryByLabelText('Sort by')).toBeNull();
    expect(screen.queryByLabelText('Direction')).toBeNull();
    expect(screen.queryByLabelText('Category ID')).toBeNull();
  });

  it('closing without applying leaves the results alone', () => {
    const onApply = vi.fn();
    render(<SearchFilters applied={applied} onApply={onApply} />);
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    fireEvent.change(screen.getByLabelText('Brand'), { target: { value: 'Sony' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close filters' }));
    expect(onApply).not.toHaveBeenCalled();
  });
});
