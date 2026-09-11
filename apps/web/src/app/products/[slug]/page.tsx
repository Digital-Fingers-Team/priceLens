import type { Metadata } from 'next';
import { ProductDetailClient } from './_product-detail-client';
import { productApi } from '@/lib/api/product.api';
import { absoluteUrl } from '@/lib/seo';
import type { CanonicalProduct } from '@/types/product.types';

export const revalidate = 300;

function formatPrice(value: number | null, currency: string) {
  if (value == null) return null;
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export async function generateMetadata(
  { params }: { params: { slug: string } },
): Promise<Metadata> {
  try {
    const product = await productApi.getBySlug(params.slug);
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
        canonical: `/products/${params.slug}`,
      },
      openGraph: {
        title,
        description,
        url: absoluteUrl(`/products/${params.slug}`),
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
  } catch {
    return {
      title: 'Product not found',
      description: 'The requested product could not be found on Pricelens.',
      robots: { index: false, follow: false },
    };
  }
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  // Fetched here, not only in the browser: this same object seeds the client
  // query, so the HTML that leaves the server already contains the heading,
  // the prices and the listings. It also feeds the structured data below --
  // without which a price comparison result cannot show a price in Google.
  let product: CanonicalProduct | undefined;
  try {
    product = await productApi.getBySlug(params.slug);
  } catch {
    // The client view renders its own not-found state, and generateMetadata
    // has already marked the page noindex.
  }

  let jsonLd: Record<string, unknown> | null = null;
  if (product) {
    const { min, max, currency } = product.priceStats;
    const offerCount =
      product._count?.sourceListings ?? product.sourceListings?.length ?? 0;

    jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.title,
      url: absoluteUrl(`/products/${params.slug}`),
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
  }

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
      <ProductDetailClient slug={params.slug} initialProduct={product} />
    </>
  );
}
