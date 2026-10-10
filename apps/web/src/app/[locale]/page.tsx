import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ArrowRight } from 'lucide-react';
import { buttonClassName } from '@/components/ui/button-styles';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchBar } from '@/components/search/search-bar';
import { ProductCardSkeleton } from '@/components/product/product-card-skeleton';
import { Link } from '@/lib/i18n/navigation';
import { getI18n, resolveLocale } from '@/lib/i18n/server';
import { CategoryLinks } from '@/components/seo/category-links';
import { categoriesApi } from '@/lib/api/categories.api';
import { groupCategories } from '@/lib/categories';
import type { Locale } from '@/lib/i18n/config';
import { absoluteUrl, baseMetadata, localizedAlternates } from '@/lib/seo';
import { organizationJsonLd, websiteJsonLd } from '@/lib/structured-data';
import { serializeJsonLd } from '@/lib/utils/json-ld';
import { HeroComparison } from './_components/hero-comparison';
import { TrendingSection } from './_components/trending-section';

// Trending prices come from the live API; without this the page was rendered
// once at build time and served with those prices forever.
export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const { t, href } = getI18n(locale);
  return {
    // The layout template does not apply to its own segment's page, so the
    // brand is added here: Google showed the title without it.
    title: { absolute: `${t.meta.siteName} | ${t.home.metaTitle}` },
    description: t.home.metaDescription,
    alternates: localizedAlternates(locale, '/'),
    // Spread the base so the share image is kept: a page-level openGraph
    // replaces the layout one whole.
    openGraph: { ...baseMetadata.openGraph, siteName: t.meta.siteName, title: t.meta.siteName, description: t.home.metaDescription, url: absoluteUrl(href('/')) },
    twitter: { ...baseMetadata.twitter, title: t.meta.siteName, description: t.home.metaDescription },
  };
}

/**
 * Links to every category page (audit 09, SEO-06). From the API, so a new
 * category appears without a deploy; the dictionary's list if it fails.
 */
async function HomeCategories({ locale }: { locale: Locale }) {
  const { t } = getI18n(locale);
  try {
    return (
      <CategoryLinks groups={groupCategories(t, await categoriesApi.list(), locale)} title={t.seo.categoriesTitle} locale={locale} />
    );
  } catch {
    const categories = Object.entries(t.categories as Record<string, string>)
      .filter(([slug]) => slug !== 'electronics')
      .map(([slug, name]) => ({ slug, name }));
    return <CategoryLinks categories={categories} title={t.seo.categoriesTitle} locale={locale} />;
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
        {/* Split hero: the promise and the search on one side, the promise
            kept (one product, every store's price, live) on the other. */}
        <div className="mx-auto grid max-w-page grid-cols-1 items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:gap-12 lg:py-20">
          <div className="flex flex-col gap-6 lg:col-span-7">
            <div className="flex flex-col gap-4">
              <p className="label-mono text-brand-text">{t.home.eyebrow}</p>
              <h1 className="text-3xl font-semibold text-fg lg:text-4xl">
                {t.home.headline} <span className="text-brand-text">{t.home.headlineAccent}</span>
              </h1>
              <p className="max-w-xl text-pretty text-base text-muted lg:text-lg">{t.home.lede}</p>
            </div>
            <SearchBar size="hero" className="w-full max-w-2xl" />
          </div>
          <div className="lg:col-span-5">
            <Suspense fallback={<Skeleton className="h-96 w-full" />}>
              <HeroComparison locale={locale} />
            </Suspense>
          </div>
        </div>
      </section>

      <section className="mx-auto flex max-w-page flex-col gap-6 px-4 py-12 sm:px-6 lg:py-16">
        {/* Sorted by how many stores sell a product: "most compared", not a
            popularity signal we do not measure. */}
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold text-fg">{t.home.mostCompared}</h2>
          <Link
            href="/search?sortBy=listingCount"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-text hover:underline"
          >
            {t.home.seeAll}
            <ArrowRight className="flip-rtl h-4 w-4" aria-hidden />
          </Link>
        </div>
        <Suspense
          fallback={
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          }
        >
          <TrendingSection locale={locale} />
        </Suspense>
      </section>

      {/* The paid tiers are for sellers; this is their door from the home page. */}
      <section className="bg-brand text-brand-fg">
        <div className="mx-auto flex max-w-page flex-col gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex max-w-2xl flex-col gap-2">
            <h2 className="text-xl font-semibold">{t.home.sellers.title}</h2>
            <p className="text-pretty text-base opacity-90">{t.home.sellers.body}</p>
          </div>
          <Link
            href="/pricing"
            className={buttonClassName({ variant: 'secondary', size: 'lg', className: 'border-transparent' })}
          >
            {t.home.sellers.cta}
          </Link>
        </div>
      </section>

      <div className="mx-auto w-full max-w-page px-4 py-12 sm:px-6 lg:py-16">
        <Suspense fallback={null}>
          <HomeCategories locale={locale} />
        </Suspense>
      </div>
    </>
  );
}
