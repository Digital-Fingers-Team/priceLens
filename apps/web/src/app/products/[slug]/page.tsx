import type { Metadata } from 'next';
import { ProductDetailClient } from './_product-detail-client';

export const metadata: Metadata = {
  title: 'Product Details',
  description: 'Compare live product prices and retailer listings.',
};

export default function ProductPage({ params }: { params: { slug: string } }) {
  return <ProductDetailClient slug={params.slug} />;
}
