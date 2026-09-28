import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { isAxiosError } from 'axios';
import { ProductDetailClient } from './_product-detail-client';
import { productApi } from '@/lib/api/product.api';
import { getI18n, resolveLocale } from '@/lib/i18n/server';
import { absoluteUrl, localizedAlternates, NOINDEX } from '@/lib/seo';
import type { CanonicalProduct } from '@/types/product.types';
import { serializeJsonLd } from '@/lib/utils/json-ld';
import { breadcrumbJsonLd } from '@/lib/structured-data';
import { RelatedProducts } from './_related-products';

export const revalidate = 300;

/**
 * No product is built ahead of time, but every one is cached after its first
 * visit and re-rendered in the background at most every 5 minutes (ISR,
 * audit 08, P-06). Without this the route rendered on every request and
 * `revalidate` never applied. The browser refetches the prices when the
 * cached HTML is older than the query's stale time (see fetchedAt below).
 */
export function generateStaticParams() {
  return [];
}

type PageProps = { params: Promise<{ slug: string; locale: string }> };

/**
 * One API call per render: generateMetadata and the page both need the
 * product, and axios requests are not deduplicated by Next the way fetch is.
 * A 404 resolves to null (a real not-found page); any other failure throws, so
 * error.tsx renders and ISR keeps serving the last good copy instead of
 * caching an error view for the whole revalidate window.
 */
const loadProduct = cache(async (slug: string): Promise<CanonicalProduct | null> => {
  try {
    return await productApi.getBySlug(slug);
  } catch (err) {
    if (isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await resolveLocale(params);
  const { t, tf, tp, fmt, href } = getI18n(locale);
  const product = await loadProduct(slug);
  if (!product) {
    return {
      title: t.product.notFoundTitle,
      description: t.product.notFoundBody,
      robots: { index: false, follow: false },
    };
  }

  const listingCount = product._count?.sourceListings ?? product.sourceListings?.length ?? 0;
  const min = product.priceStats.min;
  const title = tf(t.product.metaTitle, { title: product.title });
  const description = [
    tp(t.product.metaCompare, listingCount, { title: product.title }),
    min != null ? tf(t.product.metaFrom, { price: fmt.currency(min, product.priceStats.currency) }) : null,
    product.brand ? tf(t.product.metaBrand, { brand: product.brand }) : null,
  ]
    .filter(Boolean)
    .join(' ');
  const path = href(`/products/${slug}`);

  return {
    title,
    description,
    alternates: localizedAlternates(locale, `/products/${slug}`),
    // No store offers it right now (D-39, owner 2026-09-28): the page stays
    // reachable by URL but asks search engines not to index an empty page.
    // Search, browse and the sitemap already list only products with an offer.
    ...((product.sourceListings?.length ?? 0) === 0 ? { robots: NOINDEX } : {}),
    openGraph: {
      title,
      description,
      url: absoluteUrl(path),
      type: 'article',
      // The image is opengraph-image.tsx (a generated 1200x630 card).
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  // Fetched here, not only in the browser: this same object seeds the client
  // query, so the HTML that leaves the server already contains the heading,
  // the prices and the listings. It also feeds the structured data below --
  // without which a price comparison result cannot show a price in Google.
  const { slug } = await params;
  const locale = await resolveLocale(params);
  const { t, href } = getI18n(locale);
  const product = await loadProduct(slug);
  if (!product) notFound();
  // The API answers an old slug (a product merged into another) with the
  // product it lives on now: move the URL there for good (audit 09, SEO-09).
  if (product.slug !== slug) permanentRedirect(href(`/products/${product.slug}`));
  // When this HTML was rendered: a cached copy can be minutes old, and the
  // client query uses this to decide whether to refresh the prices at once.
  const fetchedAt = Date.now();

  const { min, max, currency } = product.priceStats;
  // The offers the page shows (live, deduplicated), not every listing ever
  // matched: structured data has to match the visible page (SEO-07).
  const offerCount = product.sourceListings?.length ?? 0;
  const categoryName =
    (t.categories as Record<string, string>)[product.category.slug] ?? product.category.name;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    url: absoluteUrl(href(`/products/${slug}`)),
    ...(product.imageUrl ? { image: product.imageUrl } : {}),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(product.model ? { model: product.model } : {}),
    ...(product.gtin ? { gtin: product.gtin } : {}),
    ...(product.mpn ? { mpn: product.mpn } : {}),
    ...(min != null
      ? {
          offers: {
            '@type': 'AggregateOffer',
            priceCurrency: currency,
            lowPrice: min,
            ...(max != null ? { highPrice: max } : {}),
            offerCount,
            availability: 'https://schema.org/InStock',
          },
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            breadcrumbJsonLd([
              { name: t.seo.home, path: href('/') },
              { name: categoryName, path: href(`/categories/${product.category.slug}`) },
              { name: product.title, path: href(`/products/${slug}`) },
            ]),
          ),
        }}
      />
      <ProductDetailClient slug={slug} initialProduct={product} fetchedAt={fetchedAt} />
      <RelatedProducts
        productId={product.id}
        categoryId={product.categoryId}
        categoryName={categoryName}
        categorySlug={product.category.slug}
        locale={locale}
      />
    </>
  );
}
