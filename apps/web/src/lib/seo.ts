import type { Metadata } from 'next';

const SITE_NAME = 'PriceLens';

function normalizeSiteUrl(value: string | undefined) {
  const fallback = 'http://localhost:3000';
  const raw = (value ?? fallback).trim();

  try {
    return new URL(raw.endsWith('/') ? raw : `${raw}/`);
  } catch {
    return new URL(fallback);
  }
}

export const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

export const baseMetadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: SITE_NAME,
  title: {
    default: 'PriceLens',
    template: '%s | PriceLens',
  },
  description:
    'PriceLens compares live product prices, retailer listings, and price history so shoppers can find the best deal fast.',
  keywords: [
    'price comparison',
    'compare prices',
    'price tracker',
    'deal finder',
    'shopping comparison',
    'price history',
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    url: siteUrl,
    title: 'PriceLens',
    description:
      'Compare live product prices, retailer listings, and price history in one place.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PriceLens',
    description:
      'Compare live product prices, retailer listings, and price history in one place.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

export function absoluteUrl(pathname: string) {
  return new URL(pathname.startsWith('/') ? pathname : `/${pathname}`, siteUrl).toString();
}
