// apps/api/src/affiliate/store-url.ts

/**
 * Whether a scraped listing URL may be used as a redirect or link target:
 * http(s) only, and on the store's own domain or a subdomain of it (S-09).
 *
 * `storeBaseUrls` are the store's known addresses -- the platform row and the
 * connector's configured storefront, which differ for Amazon (amazon.com row,
 * amazon.eg listings). A leading "www." is dropped so ar.aliexpress.com
 * matches www.aliexpress.com.
 */
export function isStoreUrl(url: string, storeBaseUrls: Array<string | null | undefined>): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return false;
  if (target.username || target.password) return false;

  const host = target.hostname.toLowerCase();
  return storeBaseUrls.some((base) => {
    if (!base) return false;
    let root: string;
    try {
      root = new URL(base).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return false;
    }
    return host === root || host.endsWith(`.${root}`);
  });
}
