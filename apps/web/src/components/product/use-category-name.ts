'use client';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { useI18n } from '@/lib/i18n/provider';

/**
 * A category's name in the UI language: the dictionary's label for its slug
 * when there is one (categories have no Arabic name in the database), else
 * the stored name.
 */
export function categoryLabel(t: Dictionary, category: { slug: string; name: string }): string {
  return (t.categories as Record<string, string>)[category.slug] ?? category.name;
}

export function useCategoryName(category: { slug: string; name: string } | null | undefined): string {
  const { t } = useI18n();
  return category ? categoryLabel(t, category) : '';
}
