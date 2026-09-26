import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { isAxiosError } from 'axios';
import { ProductDetailClient } from './_product-detail-client';
import { productApi } from '@/lib/api/product.api';
import { absoluteUrl } from '@/lib/seo';
import type { CanonicalProduct } from '@/types/product.types';
import { serializeJsonLd } from '@/lib/utils/json-ld';

export const revalidate = 300;

type PageProps = { params: Promise<{ slug: string }> };

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

function formatPrice(value: number | null, currency: string) {
  if (value == null) return null;
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) {
    return {
      title: 'Product not found',
      description: 'The requested product could not be found on Pricelens.',
      robots: { index: false, follow: false },
    };
  }

  const listingCount = product._count?.sourceListings ?? product.sourceListings?.length ?? 0;
  const price = formatPrice(product.priceStats.min, product.priceStats.currency);
  const title = `${product.title} price comparison`;
  const description = [
    `Compare live prices for ${product.title} across ${listingCount} listings.`,
    price ? `Starting from ${price}.` : null,
    product.brand ? `Brand: ${product.brand}.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    title,
    description,
    alternates: {
      canonical: `/products/${slug}`,
    },
    openGraph: {
      title,
      description,
      url: absoluteUrl(`/products/${slug}`),
      type: 'article',
      images: product.imageUrl ? [{ url: product.imageUrl, alt: product.title }] : undefined,
    },
    twitter: {
      card: product.imageUrl ? 'summary_large_image' : 'summary',
      title,
      description,
      images: product.imageUrl ? [product.imageUrl] : undefined,
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  // Fetched here, not only in the browser: this same object seeds the client
  // query, so the HTML that leaves the server already contains the heading,
  // the prices and the listings. It also feeds the structured data below --
  // without which a price comparison result cannot show a price in Google.
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) notFound();

  const { min, max, currency } = product.priceStats;
  const offerCount =
    product._count?.sourceListings ?? product.sourceListings?.length ?? 0;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    url: absoluteUrl(`/products/${slug}`),
    ...(product.imageUrl ? { image: product.imageUrl } : {}),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(product.model ? { model: product.model } : {}),
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
      <ProductDetailClient slug={slug} initialProduct={product} />
    </>
  );
}
