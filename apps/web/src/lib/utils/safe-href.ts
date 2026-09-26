import { PUBLIC_API_URL } from '@/config/constants';

/**
 * A scraped URL as a link target, or undefined when it is not plain http(s).
 * Store pages are hostile input: a `javascript:` URL in an href runs script on
 * click, and React 18 only warns about it (S-09).
 */
export function safeExternalHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:' ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Where a "Go to <store>" link points (D-21): the API's /affiliate/go
 * redirect, which records the click and forwards to the store (with the
 * affiliate parameters when the store has a program). Always the public API
 * URL: during server rendering API_BASE_URL is the container-internal one.
 * Undefined when the listing has no usable store URL, as before.
 */
export function storeGoHref(listing: { id: string; externalUrl: string | null | undefined }): string | undefined {
  if (!safeExternalHref(listing.externalUrl)) return undefined;
  return `${PUBLIC_API_URL}/affiliate/go/${encodeURIComponent(listing.id)}`;
}
