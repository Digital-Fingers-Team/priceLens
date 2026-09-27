import { absoluteUrl } from './seo';

/**
 * schema.org objects for JSON-LD (audit 09, SEO-07). Serialize with
 * serializeJsonLd (lib/utils/json-ld.ts), never JSON.stringify: product
 * titles come from stores.
 */

/** A trail of (name, site path) pairs, first to last. */
export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** The site and its search box, for the home page. */
export function websiteJsonLd({ name, homePath, searchPath }: { name: string; homePath: string; searchPath: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    url: absoluteUrl(homePath),
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${absoluteUrl(searchPath)}?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** The organization behind the site, for the home page. */
export function organizationJsonLd({ name }: { name: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name,
    url: absoluteUrl('/'),
    logo: absoluteUrl('/icon-512.png'),
  };
}
