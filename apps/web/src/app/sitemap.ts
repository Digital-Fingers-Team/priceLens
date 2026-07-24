import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

const ROUTES = ['/', '/search', '/collections', '/watchlist'];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((route) => ({
    url: absoluteUrl(route),
    lastModified: new Date(),
    changeFrequency: route === '/' ? 'daily' : 'weekly',
    priority: route === '/' ? 1 : 0.7,
  }));
}
