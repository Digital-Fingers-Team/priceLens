import type { ImageLoaderProps } from 'next/image';

/** No card or gallery shows a product photo wider than this. */
const MAX_WIDTH = 1080;

/**
 * next/image loader for product photos (PageSpeed, 2026-10-09). The built-in
 * optimizer stays off (see images in next.config.js), so without this every
 * card downloaded the store's full-size photo. The big store CDNs resize on
 * request: ask them for the width next/image picked from `sizes`. Any other
 * host, and local files, get the URL unchanged.
 */
export default function imageLoader({ src, width }: ImageLoaderProps): string {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return src;
  }
  const w = String(Math.min(width, MAX_WIDTH));
  const host = url.hostname;

  // Noon ignores `width` on its own; it resizes when a format is asked for too.
  if (host.endsWith('nooncdn.com')) {
    url.searchParams.set('width', w);
    url.searchParams.set('format', 'webp');
    return url.toString();
  }

  if (host.endsWith('cdn.shopify.com')) {
    url.searchParams.set('width', w);
    return url.toString();
  }

  // Amazon: the size is a modifier in the file name, 71Lau92TO9L._AC_UL320_.jpg.
  if (host.endsWith('media-amazon.com') || host.endsWith('ssl-images-amazon.com')) {
    const slash = url.pathname.lastIndexOf('/');
    const file = url.pathname.slice(slash + 1);
    const dot = file.lastIndexOf('.');
    if (dot <= 0) return src;
    const modifier = file.indexOf('._');
    const base = file.slice(0, modifier > 0 ? modifier : dot);
    url.pathname = `${url.pathname.slice(0, slash + 1)}${base}._AC_UL${w}_${file.slice(dot)}`;
    return url.toString();
  }

  // Jumia (thumbor): /unsafe/fit-in/300x300/filters:.../product/...
  if (host.endsWith('jumia.is')) {
    const parts = url.pathname.split('/');
    const fit = parts.indexOf('fit-in');
    if (fit < 0 || fit + 1 >= parts.length) return src;
    parts[fit + 1] = `${w}x${w}`;
    url.pathname = parts.join('/');
    return url.toString();
  }

  return src;
}
