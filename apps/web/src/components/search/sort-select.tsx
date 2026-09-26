'use client';
import { Select } from '@/components/ui/select';
import { SORT_OPTIONS } from '@/config/constants';
import { useI18n } from '@/lib/i18n/provider';
import type { SearchFilters } from '@/types/search.types';

type Sort = Pick<SearchFilters, 'sortBy' | 'sortDir'>;

/**
 * One sort control on the results bar (audit 06, U-05). Each option carries
 * its own direction, so "Lowest price" can no longer be paired with
 * "Descending" -- the old separate Direction select allowed exactly that.
 */
export function SortSelect({ value, onChange }: { value: Sort; onChange: (sort: Sort) => void }) {
  const { t } = useI18n();
  const sortBy = value.sortBy ?? 'relevance';
  // A link may carry a direction no option has; show the matching field.
  const current =
    SORT_OPTIONS.find((o) => o.value === sortBy && o.dir === (value.sortDir ?? 'desc')) ??
    SORT_OPTIONS.find((o) => o.value === sortBy) ??
    SORT_OPTIONS[0];

  return (
    <div className="flex items-center gap-2">
      <span className="label-mono shrink-0 text-muted" aria-hidden>
        {t.search.sortLabel}
      </span>
      <Select
        aria-label={t.search.sortLabel}
        wrapperClassName="w-auto"
        value={current.value}
        onChange={(e) => {
          const option = SORT_OPTIONS.find((o) => o.value === e.target.value) ?? SORT_OPTIONS[0];
          onChange({ sortBy: option.value, sortDir: option.dir });
        }}
        options={SORT_OPTIONS.map((option) => ({ value: option.value, label: t.search.sort[option.value] }))}
      />
    </div>
  );
}
