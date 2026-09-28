import { Link } from '@/lib/i18n/navigation';
import type { CategoryGroup } from '@/lib/categories';

export interface CategoryLink {
  slug: string;
  name: string;
}

function LinkList({ categories, current }: { categories: CategoryLink[]; current?: string }) {
  return (
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
  );
}

/**
 * Links to every category page: crawl paths from the home page and between
 * categories, which had none (audit 09, SEO-06). With `groups`, one list per
 * department under its own heading, since the catalogue outgrew one row of chips.
 */
export function CategoryLinks({
  categories,
  groups,
  title,
  current,
}: {
  categories?: CategoryLink[];
  groups?: CategoryGroup[];
  title: string;
  current?: string;
}) {
  const grouped = groups && groups.length > 1;
  const flat = groups && !grouped ? groups.flatMap((group) => group.categories) : categories ?? [];
  if (!grouped && flat.length === 0) return null;
  return (
    <section aria-labelledby="category-links-heading" className="flex flex-col gap-4">
      <h2 id="category-links-heading" className="text-lg font-semibold text-fg">
        {title}
      </h2>
      {grouped ? (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.slug} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-muted">{group.name}</h3>
              <LinkList categories={group.categories} current={current} />
            </div>
          ))}
        </div>
      ) : (
        <LinkList categories={flat} current={current} />
      )}
    </section>
  );
}
