import { Link } from '@/lib/i18n/navigation';

export interface CategoryLink {
  slug: string;
  name: string;
}

/**
 * Links to every category page: crawl paths from the home page and between
 * categories, which had none (audit 09, SEO-06).
 */
export function CategoryLinks({ categories, title, current }: { categories: CategoryLink[]; title: string; current?: string }) {
  if (categories.length === 0) return null;
  return (
    <section aria-labelledby="category-links-heading" className="flex flex-col gap-4">
      <h2 id="category-links-heading" className="text-lg font-semibold text-fg">
        {title}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <li key={category.slug}>
            <Link
              href={`/categories/${category.slug}`}
              aria-current={category.slug === current ? 'page' : undefined}
              className="inline-flex h-9 items-center rounded-sm border border-border-strong px-3 text-sm text-fg transition-colors hover:border-fg/60 aria-[current=page]:border-brand aria-[current=page]:text-brand"
            >
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
