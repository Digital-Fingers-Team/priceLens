'use client';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SORT_OPTIONS } from '@/config/constants';
import { useSearchStore } from '@/lib/store/search.store';
import type { SearchFilters as SearchFiltersType } from '@/types/search.types';

const tierOptions: Array<{ label: string; value: SearchFiltersType['tier'] }> = [
  { label: 'Any tier', value: undefined },
  { label: 'Budget', value: 'BUDGET' },
  { label: 'Mid-Range', value: 'MID_RANGE' },
  { label: 'Premium', value: 'PREMIUM' },
  { label: 'Ultra Premium', value: 'ULTRA_PREMIUM' },
];

const selectClassName =
  'w-full h-10 rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ink-100 focus:border-signal/60 focus:outline-none focus:ring-1 focus:ring-signal/30 transition-colors';

export function SearchFilters() {
  const filters = useSearchStore((s) => s.filters);
  const setFilter = useSearchStore((s) => s.setFilter);
  const resetFilters = useSearchStore((s) => s.resetFilters);

  const hasActiveFilters =
    !!filters.brand ||
    !!filters.categoryId ||
    !!filters.tier ||
    filters.minPrice != null ||
    filters.maxPrice != null ||
    (filters.sortBy != null && filters.sortBy !== 'minPriceUsd') ||
    (filters.sortDir != null && filters.sortDir !== 'asc');

  return (
    <aside className="w-full lg:w-80 shrink-0 rounded-xl border border-ink-700 bg-ink-900 p-5 space-y-5 lg:sticky lg:top-24">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-100">Filters</h2>
          <p className="text-xs text-ink-500 mt-1">Refine the results list</p>
        </div>

        <Button
          variant="ghost"
          size="xs"
          leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
          disabled={!hasActiveFilters}
          onClick={resetFilters}
        >
          Reset
        </Button>
      </div>

      <div className="space-y-4">
        <Input
          label="Brand"
          value={filters.brand ?? ''}
          onChange={(e) => setFilter('brand', e.target.value || undefined)}
          placeholder="Apple, Sony, Dell..."
        />

        <Input
          label="Category ID"
          value={filters.categoryId ?? ''}
          onChange={(e) => setFilter('categoryId', e.target.value || undefined)}
          placeholder="electronics, laptops..."
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Min price"
            type="number"
            min="0"
            value={filters.minPrice ?? ''}
            onChange={(e) =>
              setFilter('minPrice', e.target.value === '' ? undefined : Number(e.target.value))
            }
          />
          <Input
            label="Max price"
            type="number"
            min="0"
            value={filters.maxPrice ?? ''}
            onChange={(e) =>
              setFilter('maxPrice', e.target.value === '' ? undefined : Number(e.target.value))
            }
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink-200">Tier</label>
          <select
            className={selectClassName}
            value={filters.tier ?? ''}
            onChange={(e) => setFilter('tier', (e.target.value || undefined) as SearchFiltersType['tier'])}
          >
            {tierOptions.map((option) => (
              <option key={option.label} value={option.value ?? ''}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink-200">Sort by</label>
            <select
              className={selectClassName}
              value={filters.sortBy ?? 'minPriceUsd'}
              onChange={(e) =>
                setFilter('sortBy', e.target.value as SearchFiltersType['sortBy'])
              }
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink-200">Direction</label>
            <select
              className={selectClassName}
              value={filters.sortDir ?? 'asc'}
              onChange={(e) =>
                setFilter('sortDir', e.target.value as SearchFiltersType['sortDir'])
              }
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>
      </div>
    </aside>
  );
}
