import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SortSelect } from './sort-select';

describe('SortSelect', () => {
  afterEach(cleanup);

  it('each choice sets field and direction together', () => {
    const onChange = vi.fn();
    render(<SortSelect value={{ sortBy: 'relevance', sortDir: 'desc' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'minPriceUsd' } });
    expect(onChange).toHaveBeenCalledWith({ sortBy: 'minPriceUsd', sortDir: 'asc' });
  });

  it('shows the matching field for a direction no option has (old links)', () => {
    render(<SortSelect value={{ sortBy: 'minPriceUsd', sortDir: 'desc' }} onChange={vi.fn()} />);
    expect((screen.getByLabelText('Sort') as HTMLSelectElement).value).toBe('minPriceUsd');
  });
});
