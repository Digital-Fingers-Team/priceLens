'use client';
import { categoryName } from '@/lib/categories';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import type { Locale } from '@/lib/i18n/config';
import { useI18n } from '@/lib/i18n/provider';

/**
 * A category's name in the UI language: the dictionary's label for its slug
 * when there is one, else the API's Arabic name on an Arabic page, else the
 * stored name. See categoryName.
 */
export function categoryLabel(
  t: Dictionary,
  category: { slug: string; name: string; nameAr?: string | null },
  locale: Locale = 'en',
): string {
  return categoryName(t, category, locale);
}

export function useCategoryName(category: { slug: string; name: string; nameAr?: string | null } | null | undefined): string {
  const { t, locale } = useI18n();
  return category ? categoryLabel(t, category, locale) : '';
}
