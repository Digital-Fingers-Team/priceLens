'use client';
import { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { categoryLabel } from '@/components/product/use-category-name';
import { PRODUCT_TIERS } from '@/config/constants';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { useCategories } from '@/lib/hooks/use-search';
import { useI18n } from '@/lib/i18n/provider';
import { useSearchStore } from '@/lib/store/search.store';
import type { SearchFilters as SearchFiltersType } from '@/types/search.types';

// Sort is not here: it sits on the results bar (SortSelect).
type FilterFields = Pick<SearchFiltersType, 'brand' | 'categoryId' | 'tier' | 'minPrice' | 'maxPrice'>;

const EMPTY_FILTERS: FilterFields = {
  brand: undefined,
  categoryId: undefined,
  tier: undefined,
  minPrice: undefined,
  maxPrice: undefined,
};

function pickFilterFields(filters: SearchFiltersType): FilterFields {
  const { brand, categoryId, tier, minPrice, maxPrice } = filters;
  return { brand, categoryId, tier, minPrice, maxPrice };
}

function countActive(filters: FilterFields): number {
  return [!!filters.brand, !!filters.categoryId, !!filters.tier, filters.minPrice != null, filters.maxPrice != null].filter(
    Boolean,
  ).length;
}

interface SearchFiltersProps {
  /** The filters currently in the URL. */
  applied: SearchFiltersType;
  /** Called on Apply with the draft; the page writes it to the URL. */
  onApply: (filters: FilterFields) => void;
}

/**
 * Collapsed to a "Filters" button; opening it shows the form: a sidebar from
 * lg, a bottom sheet on phones and tablets (audit 07, UI-13), so the results
 * stay where they are. The search only re-runs on Apply. Edits go to a
 * local draft until then, so typing a price does not fire a search per
 * keystroke, and closing really does leave results as they were.
 */
export function SearchFilters({ applied, onApply }: SearchFiltersProps) {
  const { t, locale } = useI18n();
  const open = useSearchStore((s) => s.isFilterPanelOpen);
  const toggleOpen = useSearchStore((s) => s.toggleFilterPanel);
  const wide = useMediaQuery('(min-width: 1024px)');
  const { data: categories } = useCategories();

  const [filters, setDraft] = useState<FilterFields>(() => pickFilterFields(applied));
  const setFilter = <K extends keyof FilterFields>(key: K, value: FilterFields[K]) =>
    setDraft((draft) => ({ ...draft, [key]: value }));

  // Re-seed the draft from what is applied each time the form opens (back/
  // forward or a new search may have changed the URL while it was closed).
  useEffect(() => {
    if (open) setDraft(pickFilterFields(applied));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const categoryOptions = useMemo(
    () =>
      (categories ?? [])
        .map((category) => ({ value: category.id, label: categoryLabel(t, category) }))
        .sort((a, b) => a.label.localeCompare(b.label, locale)),
    [categories, t, locale],
  );

  const activeCount = countActive(pickFilterFields(applied));
  const draftIsEmpty = countActive(filters) === 0;

  const apply = () => {
    onApply(filters);
    toggleOpen();
  };

  const fields = (
    <div className="flex flex-col gap-4">
      <Select
        label={t.search.category}
        placeholder={t.search.anyCategory}
        value={filters.categoryId ?? ''}
        onChange={(e) => setFilter('categoryId', e.target.value || undefined)}
        options={categoryOptions}
      />
      <Input
        label={t.search.brand}
        value={filters.brand ?? ''}
        onChange={(e) => setFilter('brand', e.target.value || undefined)}
        placeholder={t.search.brandPlaceholder}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label={t.search.minPrice}
          type="number"
          inputMode="decimal"
          dir="ltr"
          min="0"
          value={filters.minPrice ?? ''}
          onChange={(e) => setFilter('minPrice', e.target.value === '' ? undefined : Number(e.target.value))}
        />
        <Input
          label={t.search.maxPrice}
          type="number"
          inputMode="decimal"
          dir="ltr"
          min="0"
          value={filters.maxPrice ?? ''}
          onChange={(e) => setFilter('maxPrice', e.target.value === '' ? undefined : Number(e.target.value))}
        />
      </div>
      <Select
        label={t.search.tier}
        placeholder={t.search.anyTier}
        value={filters.tier ?? ''}
        onChange={(e) => setFilter('tier', e.target.value || undefined)}
        options={PRODUCT_TIERS.map((tier) => ({ value: tier, label: t.tiers[tier] }))}
      />
    </div>
  );

  const actions = (
    <>
      <Button variant="ghost" disabled={draftIsEmpty} onClick={() => setDraft(EMPTY_FILTERS)}>
        {t.search.reset}
      </Button>
      <Button onClick={apply}>{t.search.apply}</Button>
    </>
  );

  const trigger = (
    <Button
      variant="secondary"
      size="sm"
      leftIcon={<SlidersHorizontal className="h-4 w-4" aria-hidden />}
      onClick={toggleOpen}
      aria-expanded={open}
    >
      {t.search.filters}
      {activeCount > 0 && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 font-sans text-xs text-brand-fg">
          {activeCount}
        </span>
      )}
    </Button>
  );

  if (!wide) {
    return (
      <div className="shrink-0">
        {trigger}
        <Dialog open={open} onClose={toggleOpen} variant="sheet" title={t.search.filters} footer={actions}>
          {fields}
        </Dialog>
      </div>
    );
  }

  if (!open) return <div className="shrink-0 lg:sticky lg:top-24">{trigger}</div>;

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-6 rounded border border-border bg-surface p-6 lg:sticky lg:top-24">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-fg">{t.search.filters}</h2>
        <IconButton size="sm" aria-label={t.search.closeFilters} onClick={toggleOpen} className="-me-2">
          <X className="h-4 w-4" />
        </IconButton>
      </div>
      {fields}
      <div className="flex justify-end gap-2">{actions}</div>
    </aside>
  );
}
