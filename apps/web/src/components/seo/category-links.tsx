import {
  AirVent,
  Baby,
  Bike,
  Camera,
  Car,
  ChevronDown,
  CookingPot,
  Droplets,
  Dumbbell,
  Gamepad2,
  Headphones,
  HeartPulse,
  Laptop,
  Luggage,
  Music,
  Package,
  Refrigerator,
  Router,
  Smartphone,
  Sofa,
  Sparkles,
  SprayCan,
  Tent,
  Trees,
  Watch,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Link } from '@/lib/i18n/navigation';
import type { CategoryGroup } from '@/lib/categories';
import type { Locale } from '@/lib/i18n/config';
import { getI18n } from '@/lib/i18n/server';

export interface CategoryLink {
  slug: string;
  name: string;
}

/** One glyph per department (the API's group slugs); a box for anything new. */
const DEPARTMENT_ICONS: Record<string, LucideIcon> = {
  electronics: Smartphone,
  'large-appliances': Refrigerator,
  'kitchen-appliances': CookingPot,
  computing: Laptop,
  furniture: Sofa,
  climate: AirVent,
  fitness: Dumbbell,
  audio: Headphones,
  cameras: Camera,
  'home-care': SprayCan,
  mobility: Bike,
  baby: Baby,
  networking: Router,
  music: Music,
  'home-garden': Trees,
  health: HeartPulse,
  automotive: Car,
  'sports-outdoor': Tent,
  'personal-care': Droplets,
  tools: Wrench,
  gaming: Gamepad2,
  'watches-jewelry': Watch,
  travel: Luggage,
  beauty: Sparkles,
};

/** Categories a tile shows before folding the rest under "+N more". */
const VISIBLE = 5;

const linkClass =
  'inline-block rounded-sm py-1 text-sm text-fg transition-colors hover:text-brand-text hover:underline aria-[current=page]:font-medium aria-[current=page]:text-brand-text';

function LinkList({ categories, current }: { categories: CategoryLink[]; current?: string }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {categories.map((category) => (
        <li key={category.slug}>
          <Link
            href={`/categories/${category.slug}`}
            aria-current={category.slug === current ? 'page' : undefined}
            className="inline-flex h-9 items-center rounded-full border border-border-strong px-4 text-sm text-fg transition-colors hover:border-brand hover:text-brand-text aria-[current=page]:border-brand aria-[current=page]:bg-brand-soft aria-[current=page]:text-brand-soft-fg"
          >
            {category.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DepartmentTile({ group, current, locale }: { group: CategoryGroup; current?: string; locale: Locale }) {
  const { t, tp } = getI18n(locale);
  const Icon = DEPARTMENT_ICONS[group.slug] ?? Package;
  const first = group.categories.slice(0, VISIBLE);
  const rest = group.categories.slice(VISIBLE);
  const holdsCurrent = rest.some((category) => category.slug === current);
  const item = (category: CategoryLink) => (
    <li key={category.slug}>
      <Link href={`/categories/${category.slug}`} aria-current={category.slug === current ? 'page' : undefined} className={linkClass}>
        {category.name}
      </Link>
    </li>
  );

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-brand-soft text-brand-soft-fg">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <h3 className="text-base font-semibold text-fg">{group.name}</h3>
      </div>
      <ul className="flex flex-col">{first.map(item)}</ul>
      {/* Folded, not dropped: every category stays a link in the page for
          crawlers (audit 09, SEO-06). */}
      {rest.length > 0 && (
        <details open={holdsCurrent} className="group">
          <summary className="w-fit cursor-pointer list-none rounded-sm text-sm font-medium text-brand-text hover:underline group-open:hidden">
            {tp(t.seo.moreCategories, rest.length)}
          </summary>
          <ul className="flex flex-col">{rest.map(item)}</ul>
        </details>
      )}
    </div>
  );
}

function DepartmentRow({ group, current }: { group: CategoryGroup; current?: string }) {
  const Icon = DEPARTMENT_ICONS[group.slug] ?? Package;
  return (
    <details open={group.categories.some((category) => category.slug === current)} className="group">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-brand-soft text-brand-soft-fg">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="flex-1 text-sm font-medium text-fg">{group.name}</span>
        <span className="text-xs tabular-nums text-muted">{group.categories.length}</span>
        <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="flex flex-col px-4 pb-4 ps-16">
        {group.categories.map((category) => (
          <li key={category.slug}>
            <Link
              href={`/categories/${category.slug}`}
              aria-current={category.slug === current ? 'page' : undefined}
              className={`${linkClass} flex min-h-10 items-center`}
            >
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Links to every category page: crawl paths from the home page and between
 * categories (audit 09, SEO-06). With `groups`, one tile per department with
 * its first few categories and the rest folded, instead of a wall of chips.
 */
export function CategoryLinks({
  categories,
  groups,
  title,
  current,
  locale,
}: {
  categories?: CategoryLink[];
  groups?: CategoryGroup[];
  title: string;
  current?: string;
  locale: Locale;
}) {
  const grouped = groups && groups.length > 1;
  const flat = groups && !grouped ? groups.flatMap((group) => group.categories) : categories ?? [];
  if (!grouped && flat.length === 0) return null;
  return (
    <section aria-labelledby="category-links-heading" className="flex flex-col gap-6">
      <h2 id="category-links-heading" className="text-xl font-semibold text-fg">
        {title}
      </h2>
      {grouped ? (
        <>
          {/* Phones: one row per department that opens in place; 24 tiles
              stacked were a dozen screens of scrolling. */}
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface sm:hidden">
            {groups.map((group) => (
              <li key={group.slug}>
                <DepartmentRow group={group} current={current} />
              </li>
            ))}
          </ul>
          <div className="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {groups.map((group) => (
              <DepartmentTile key={group.slug} group={group} current={current} locale={locale} />
            ))}
          </div>
        </>
      ) : (
        <LinkList categories={flat} current={current} />
      )}
    </section>
  );
}
