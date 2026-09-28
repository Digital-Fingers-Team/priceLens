import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchBar } from '@/components/search/search-bar';
import { ProductCardSkeleton } from '@/components/product/product-card-skeleton';
import { Link } from '@/lib/i18n/navigation';
import { getI18n, resolveLocale } from '@/lib/i18n/server';
import { CategoryLinks } from '@/components/seo/category-links';
import { categoriesApi } from '@/lib/api/categories.api';
import { groupCategories } from '@/lib/categories';
import type { Locale } from '@/lib/i18n/config';
import { absoluteUrl, localizedAlternates } from '@/lib/seo';
import { organizationJsonLd, websiteJsonLd } from '@/lib/structured-data';
import { serializeJsonLd } from '@/lib/utils/json-ld';
import { TrendingSection } from './_components/trending-section';

// Trending prices come from the live API; without this the page was rendered
// once at build time and served with those prices forever.
export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const { t, href } = getI18n(locale);
  return {
    title: t.home.metaTitle,
    description: t.home.metaDescription,
    alternates: localizedAlternates(locale, '/'),
    openGraph: { title: t.meta.siteName, description: t.home.metaDescription, url: absoluteUrl(href('/')) },
    twitter: { title: t.meta.siteName, description: t.home.metaDescription },
  };
}

/**
 * Links to every category page (audit 09, SEO-06). From the API, so a new
 * category appears without a deploy; the dictionary's list if it fails.
 */
async function HomeCategories({ locale }: { locale: Locale }) {
  const { t } = getI18n(locale);
  try {
    return <CategoryLinks groups={groupCategories(t, await categoriesApi.list(), locale)} title={t.seo.categoriesTitle} />;
  } catch {
    const categories = Object.entries(t.categories as Record<string, string>)
      .filter(([slug]) => slug !== 'electronics')
      .map(([slug, name]) => ({ slug, name }));
    return <CategoryLinks categories={categories} title={t.seo.categoriesTitle} />;
  }
}

export default async function HomePage({ params }: Props) {
  const locale = await resolveLocale(params);
  const { t, href } = getI18n(locale);
  const structuredData = [
    websiteJsonLd({ name: t.meta.siteName, homePath: href('/'), searchPath: href('/search') }),
    organizationJsonLd({ name: t.meta.siteName }),
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
      <section className="border-b border-border">
        <div className="mx-auto flex max-w-page flex-col gap-8 px-4 py-16 sm:px-6 lg:py-24">
          <div className="flex max-w-2xl flex-col gap-4">
            <p className="label-mono text-brand">{t.home.eyebrow}</p>
            <h1 className="text-balance text-2xl font-semibold text-fg">
              {t.home.headline} <span className="text-brand">{t.home.headlineAccent}</span>
            </h1>
            <p className="max-w-xl text-balance text-base text-muted">{t.home.lede}</p>
          </div>
          <SearchBar size="hero" className="w-full max-w-2xl" />
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {t.home.features.map((feature) => (
              <li key={feature} className="label-mono text-muted">
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto flex max-w-page flex-col gap-6 px-4 py-12 sm:px-6">
        {/* Sorted by how many store listings a product has: "most compared",
            not a popularity signal we do not measure. */}
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold text-fg">{t.home.mostCompared}</h2>
          <Link href="/search?sortBy=listingCount" className="label-mono text-brand hover:underline">
            {t.home.seeAll}
          </Link>
        </div>
        <Suspense
          fallback={
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          }
        >
          <TrendingSection locale={locale} />
        </Suspense>
      </section>

      <div className="mx-auto w-full max-w-page px-4 pb-12 sm:px-6">
        <Suspense fallback={null}>
          <HomeCategories locale={locale} />
        </Suspense>
      </div>
    </>
  );
}
