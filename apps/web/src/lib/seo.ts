import type { Metadata } from 'next';

const SITE_NAME = 'Pricelens';

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
    default: 'Pricelens',
    template: '%s | Pricelens',
  },
  description:
    'Pricelens compares live product prices, retailer listings, and price history so shoppers can find the best deal fast.',
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
  // Search Console ownership. The same token also works as a DNS TXT record;
  // that form survives a deploy that loses this file, so it is worth having
  // both rather than either.
  verification: {
    google: '8zTrv7h55TdtqBgvI86DvV94SgH69wvlibbBUKrdZoU',
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    url: siteUrl,
    title: 'Pricelens',
    description:
      'Compare live product prices, retailer listings, and price history in one place.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pricelens',
    description:
      'Compare live product prices, retailer listings, and price history in one place.',
    images: ['/og-image.png'],
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
