'use client';
import { useId } from 'react';
import { SORT_OPTIONS } from '@/config/constants';
import type { SearchFilters } from '@/types/search.types';

type Sort = Pick<SearchFilters, 'sortBy' | 'sortDir'>;

/**
 * One sort control on the results bar (audit 06, U-05). Each option carries
 * its own direction, so "Lowest price" can no longer be paired with
 * "Descending" -- the old separate Direction select allowed exactly that.
 */
export function SortSelect({ value, onChange }: { value: Sort; onChange: (sort: Sort) => void }) {
  const id = useId();
  const sortBy = value.sortBy ?? 'relevance';
  // A link may carry a direction no option has; show the matching field.
  const current =
    SORT_OPTIONS.find((o) => o.value === sortBy && o.dir === (value.sortDir ?? 'desc')) ??
    SORT_OPTIONS.find((o) => o.value === sortBy) ??
    SORT_OPTIONS[0];

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-ink-500">
        Sort
      </label>
      <select
        id={id}
        value={current.value}
        onChange={(e) => {
          const option = SORT_OPTIONS.find((o) => o.value === e.target.value) ?? SORT_OPTIONS[0];
          onChange({ sortBy: option.value, sortDir: option.dir });
        }}
        className="h-10 rounded-lg border border-ink-600 bg-ink-800 px-3 text-sm text-ink-100 focus:border-signal/60 focus:outline-none focus:ring-1 focus:ring-signal/30"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
