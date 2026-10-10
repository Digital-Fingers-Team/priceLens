import { Link } from '@/lib/i18n/navigation';
import type { Dictionary } from '@/lib/i18n/dictionaries';

/**
 * The site's main sections, rendered on the server for every visitor. The
 * navbar's own links wait for the stored session, so without this strip the
 * HTML had no section links at all; Google picks sitelinks from links like
 * these.
 */
const SECTIONS = [
  ['/categories/smartphones', 'smartphones'],
  ['/categories/laptops', 'laptops'],
  ['/categories/televisions', 'televisions'],
  ['/categories/air-conditioners', 'airConditioners'],
  ['/categories/refrigerators', 'refrigerators'],
  ['/categories/washing-machines', 'washingMachines'],
  ['/categories/headphones', 'headphones'],
  ['/categories/smart-watches', 'smartWatches'],
  ['/search', 'allProducts'],
  ['/deal-hunter', 'dealHunter'],
] as const;

export function SectionNav({ t }: { t: Dictionary }) {
  return (
    <nav aria-label={t.nav.sectionsLabel} className="border-b border-border bg-surface">
      <ul className="mx-auto flex max-w-page gap-1 overflow-x-auto px-2 py-1 [scrollbar-width:none] sm:px-4">
        {SECTIONS.map(([href, key]) => (
          <li key={href} className="shrink-0">
            <Link
              href={href}
              className="block whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              {t.nav.sections[key]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
