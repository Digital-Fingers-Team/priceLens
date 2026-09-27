import { ProductList } from '@/components/product/product-list';
import { searchApi } from '@/lib/api/search.api';
import { Link } from '@/lib/i18n/navigation';
import type { Locale } from '@/lib/i18n/config';
import { getI18n } from '@/lib/i18n/server';

const COUNT = 4;

/**
 * "More in <category>": the category's best-covered products (the browse
 * ranking the API caches), rendered with the cached product page, so every
 * product links to its neighbours (audit 09, SEO-14). Best effort: nothing
 * is shown if the API fails.
 */
export async function RelatedProducts({
  productId,
  categoryId,
  categoryName,
  locale,
  categorySlug,
}: {
  productId: string;
  categoryId: string;
  categoryName: string;
  locale: Locale;
  categorySlug: string;
}) {
  const { t, tf } = getI18n(locale);
  let hits;
  try {
    hits = (await searchApi.search({ q: '', categoryId, limit: COUNT + 1 }, { timeout: 2500 })).hits;
  } catch {
    return null;
  }
  const others = hits.filter((hit) => hit.id !== productId).slice(0, COUNT);
  if (others.length === 0) return null;

  return (
    <section aria-labelledby="related-heading" className="mx-auto flex max-w-page flex-col gap-4 px-4 pb-12 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="related-heading" className="text-lg font-semibold text-fg">
          {tf(t.seo.relatedTitle, { name: categoryName })}
        </h2>
        <Link href={`/categories/${categorySlug}`} className="label-mono text-brand hover:underline">
          {categoryName}
        </Link>
      </div>
      <ProductList products={others} />
    </section>
  );
}
