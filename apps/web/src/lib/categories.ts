import type { Dictionary } from '@/lib/i18n/dictionaries';
import type { CategoryOption } from '@/types/search.types';

/**
 * Leaf categories with their name in the page's language. The API's names are
 * English; the dictionary has both (a category missing there keeps its API
 * name). Parents with no products of their own (Electronics) are left out.
 */
export function localizedCategories(t: Dictionary, categories: CategoryOption[]) {
  const names = t.categories as Record<string, string>;
  return categories
    .filter((category) => category.parentId !== null || categories.every((other) => other.parentId !== category.id))
    .map((category) => ({ ...category, name: names[category.slug] ?? category.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
