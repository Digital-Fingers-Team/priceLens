'use client';
import { useEffect, useId, useState } from 'react';
import { Check, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
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

type FilterFields = Pick<
  SearchFiltersType,
  'brand' | 'categoryId' | 'tier' | 'minPrice' | 'maxPrice' | 'sortBy' | 'sortDir'
>;

const EMPTY_FILTERS: FilterFields = {
  brand: undefined,
  categoryId: undefined,
  tier: undefined,
  minPrice: undefined,
  maxPrice: undefined,
  sortBy: 'relevance',
  sortDir: 'desc',
};

function pickFilterFields(filters: SearchFiltersType): FilterFields {
  const { brand, categoryId, tier, minPrice, maxPrice, sortBy, sortDir } = filters;
  return { brand, categoryId, tier, minPrice, maxPrice, sortBy, sortDir };
}

function countActive(filters: FilterFields): number {
  return [
    !!filters.brand,
    !!filters.categoryId,
    !!filters.tier,
    filters.minPrice != null,
    filters.maxPrice != null,
    (filters.sortBy ?? 'relevance') !== 'relevance' || (filters.sortDir ?? 'desc') !== 'desc',
  ].filter(Boolean).length;
}

/**
 * Collapsed to a small "Filters" button; opening it shows the form, and the
 * search only re-runs on Apply, which also folds the form back into the
 * button. Edits go to a local draft until then, so typing a price does not
 * fire a search per keystroke, and Cancel really does leave results as they were.
 */
interface SearchFiltersProps {
  /** The filters currently in the URL. */
  applied: SearchFiltersType;
  /** Called on Apply with the draft; the page writes it to the URL. */
  onApply: (filters: FilterFields) => void;
}

export function SearchFilters({ applied, onApply }: SearchFiltersProps) {
  const open = useSearchStore((s) => s.isFilterPanelOpen);
  const toggleOpen = useSearchStore((s) => s.toggleFilterPanel);

  const id = useId();
  const [filters, setDraft] = useState<FilterFields>(() => pickFilterFields(applied));
  const setFilter = <K extends keyof FilterFields>(key: K, value: FilterFields[K]) =>
    setDraft((draft) => ({ ...draft, [key]: value }));

  // Re-seed the draft from what is applied each time the form opens (back/
  // forward or a new search may have changed the URL while it was closed).
  useEffect(() => {
    if (open) setDraft(pickFilterFields(applied));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const activeCount = countActive(pickFilterFields(applied));
  const draftIsEmpty = countActive(filters) === 0;

  const apply = () => {
    onApply(filters);
    toggleOpen();
  };

  if (!open) {
    return (
      <div className="shrink-0 lg:sticky lg:top-24">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<SlidersHorizontal className="w-4 h-4" />}
          onClick={toggleOpen}
          aria-expanded={false}
        >
          Filters
          {activeCount > 0 && (
            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-signal px-1.5 text-[11px] font-bold text-ink-900">
              {activeCount}
            </span>
          )}
        </Button>
      </div>
    );
  }

  return (
    <aside className="w-full lg:w-80 shrink-0 rounded-xl border border-ink-700 bg-ink-900 p-5 space-y-5 lg:sticky lg:top-24">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-100">Filters</h2>
          <p className="text-xs text-ink-500 mt-1">Refine the results list</p>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            disabled={draftIsEmpty}
            onClick={() => setDraft(EMPTY_FILTERS)}
          >
            Reset
          </Button>
          <Button variant="ghost" size="xs" aria-label="Close filters" onClick={toggleOpen}>
            <X className="w-4 h-4" />
          </Button>
        </div>
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
          <label htmlFor={`${id}-tier`} className="text-sm font-medium text-ink-200">Tier</label>
          <select
            id={`${id}-tier`}
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
            <label htmlFor={`${id}-sort-by`} className="text-sm font-medium text-ink-200">Sort by</label>
            <select
              id={`${id}-sort-by`}
              className={selectClassName}
              value={filters.sortBy ?? 'relevance'}
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
            <label htmlFor={`${id}-sort-dir`} className="text-sm font-medium text-ink-200">Direction</label>
            <select
              id={`${id}-sort-dir`}
              className={selectClassName}
              value={filters.sortDir ?? 'desc'}
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

      <Button className="w-full" leftIcon={<Check className="w-4 h-4" />} onClick={apply}>
        Apply
      </Button>
    </aside>
  );
}
