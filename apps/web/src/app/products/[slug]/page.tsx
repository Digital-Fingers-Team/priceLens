import type { Metadata } from 'next';
import { ProductDetailClient } from './_product-detail-client';
import { productApi } from '@/lib/api/product.api';
import { absoluteUrl } from '@/lib/seo';

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
      description: 'The requested product could not be found on PriceLens.',
      robots: { index: false, follow: false },
    };
  }
}

export default function ProductPage({ params }: { params: { slug: string } }) {
  return <ProductDetailClient slug={params.slug} />;
}
