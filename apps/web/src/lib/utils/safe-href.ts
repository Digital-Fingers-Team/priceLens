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
