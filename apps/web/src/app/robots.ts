import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';

/**
 * Everything is crawlable except the API (JSON and the store-link redirect).
 * Private pages carry `noindex` instead of a Disallow: a disallowed page
 * cannot be crawled, so its noindex would never be seen (audit 09, SEO-11).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: '/api/' }],
    sitemap: new URL('/sitemap.xml', siteUrl).toString(),
  };
}
