import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { PackageSearch } from 'lucide-react';
import { ProductList } from '@/components/product/product-list';
import { Breadcrumbs } from '@/components/seo/breadcrumbs';
import { CategoryLinks } from '@/components/seo/category-links';
import { buttonClassName } from '@/components/ui/button-styles';
import { EmptyState } from '@/components/ui/state';
import { categoriesApi } from '@/lib/api/categories.api';
import { searchApi } from '@/lib/api/search.api';
import { categoryName, groupCategories } from '@/lib/categories';
import { Link } from '@/lib/i18n/navigation';
import { getI18n, resolveLocale } from '@/lib/i18n/server';
import { localizedAlternates, NOINDEX } from '@/lib/seo';
import { breadcrumbJsonLd } from '@/lib/structured-data';
import { serializeJsonLd } from '@/lib/utils/json-ld';
import { CategoryPagination } from './_category-pagination';

type PageProps = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

const PAGE_SIZE = 20;

function pageFrom(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n > 1 ? n : 1;
}

/**
 * One API round for metadata and page (React's cache). The product list is
 * the browse ranking within the category (most stores first), which the API
 * caches for a minute. A failed API call throws: error.tsx, not an empty
 * category page that search engines would index as such.
 */
const loadCategoryPage = cache(async (slug: string, page: number) => {
  const categories = await categoriesApi.list();
  const category = categories.find((c) => c.slug === slug);
  if (!category) return null;
  const results = await searchApi.search({ q: '', categoryId: category.id, page, limit: PAGE_SIZE });
  return { category, categories, results };
});

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await resolveLocale(params);
  const { t, tf } = getI18n(locale);
  const page = pageFrom((await searchParams).page);
  const data = await loadCategoryPage(slug, page);
  if (!data) return { title: t.errors.notFoundTitle, robots: { index: false, follow: false } };

  const name = categoryName(t, data.category, locale);
  // Each page of a paginated list is its own canonical (not page 1).
  const path = page > 1 ? `/categories/${slug}?page=${page}` : `/categories/${slug}`;
  return {
    title: page > 1 ? tf(t.seo.categoryPagedTitle, { name, page }) : tf(t.seo.categoryTitle, { name }),
    description: tf(t.seo.categoryDescription, { name }),
    alternates: localizedAlternates(locale, path),
    ...(data.results.hits.length === 0 ? { robots: NOINDEX } : {}),
  };
}

/**
 * A category's products, server-rendered (audit 09, SEO-06): the crawlable
 * entry point between the home page and the product pages. Filtering and
 * sorting happen in search, one link away.
 */
export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const locale = await resolveLocale(params);
  const { t, tp, href } = getI18n(locale);
  const page = pageFrom((await searchParams).page);
  const data = await loadCategoryPage(slug, page);
  if (!data) notFound();

  const { category, categories, results } = data;
  const totalPages = Math.max(1, Math.ceil(results.total / PAGE_SIZE));
  if (page > totalPages) notFound();

  const name = categoryName(t, category, locale);
  const trail = [
    { name: t.seo.home, path: href('/') },
    { name, path: href(`/categories/${slug}`) },
  ];

  return (
    <div className="mx-auto flex max-w-page flex-col gap-8 px-4 py-8 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd(trail)) }} />

      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: t.seo.home, href: '/' }, { label: name }]} label={t.seo.breadcrumbs} />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-fg">{name}</h1>
            <p className="text-sm text-muted">{tp(t.seo.categoryLede, results.total)}</p>
          </div>
          <Link href={`/search?categoryId=${category.id}`} className={buttonClassName({ variant: 'secondary', size: 'sm' })}>
            {t.seo.refine}
          </Link>
        </div>
      </div>

      {results.hits.length === 0 ? (
        <EmptyState icon={<PackageSearch className="h-5 w-5" />} title={t.seo.categoryEmpty} className="rounded border border-border" />
      ) : (
        <ProductList products={results.hits} />
      )}

      <CategoryPagination slug={slug} page={page} totalPages={totalPages} />

      <CategoryLinks groups={groupCategories(t, categories, locale)} title={t.seo.categoriesTitle} current={slug} />
    </div>
  );
}
