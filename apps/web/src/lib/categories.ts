import type { Dictionary } from '@/lib/i18n/dictionaries';
import type { Locale } from '@/lib/i18n/config';
import type { CategoryOption } from '@/types/search.types';

type Named = { slug: string; name: string; nameAr?: string | null };

/**
 * A category's name in the page's language: the dictionary's label for its
 * slug (the original categories have one), else the API's Arabic name on an
 * Arabic page, else the API's (English) name.
 */
export function categoryName(t: Dictionary, category: Named, locale: Locale = 'en'): string {
  const names = t.categories as Record<string, string>;
  return names[category.slug] ?? (locale === 'ar' ? category.nameAr : null) ?? category.name;
}

/**
 * Leaf categories with their name in the page's language. Parents with no
 * products of their own (the group roots) are left out.
 */
export function localizedCategories(t: Dictionary, categories: CategoryOption[], locale: Locale = 'en') {
  return categories
    .filter((category) => category.parentId !== null || categories.every((other) => other.parentId !== category.id))
    .map((category) => ({ ...category, name: categoryName(t, category, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

export interface CategoryGroup {
  slug: string;
  name: string;
  categories: Array<{ slug: string; name: string }>;
}

const OTHER = 'other';

/**
 * Leaf categories grouped by department for browsing: electronics (the
 * original catalogue) first, then the groups with the most products, and
 * leaves without a group last under "other". Leaves sort by their name.
 */
export function groupCategories(t: Dictionary, categories: CategoryOption[], locale: Locale = 'en'): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup & { products: number }>();
  for (const category of localizedCategories(t, categories, locale)) {
    const slug = category.groupSlug ?? OTHER;
    let group = groups.get(slug);
    if (!group) {
      const name =
        slug === OTHER
          ? t.seo.otherCategories
          :categoryName(t, { slug, name: category.groupName ?? slug, nameAr: category.groupNameAr }, locale);
      group = { slug, name, categories: [], products: 0 };
      groups.set(slug, group);
    }
    group.categories.push({ slug: category.slug, name: category.name });
    group.products += category.productCount;
  }
  const rank = (slug: string) => (slug === 'electronics' ? 0 : slug === OTHER ? 2 : 1);
  return [...groups.values()]
    .sort((a, b) => rank(a.slug) - rank(b.slug) || b.products - a.products || a.name.localeCompare(b.name, locale))
    .map(({ products: _products, ...group }) => group);
}
