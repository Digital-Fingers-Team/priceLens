import type { Page } from 'patchright';
import { RetailerListing } from '../interfaces/retailer-listing.interface';

/**
 * A page that brings fewer new listings than this is taken as the end of the
 * results: a narrow query ("galaxy s25 ultra 512gb") fits on one page, and
 * asking for its page 2 only returns the store's unrelated filler.
 */
export const MIN_LISTINGS_FOR_NEXT_PAGE = 10;

/** The pause before asking for the next page, as a shopper reading the first would. */
export const NEXT_PAGE_DELAY_MS = 1500;

export interface ResultPagesOptions {
  limit: number;
  maxPages: number;
  delayMs?: number;
  onLaterPageError?: (pageNumber: number, error: unknown) => void;
}

/**
 * Reads a store's search results page by page, as a shopper clicking "Next"
 * would, until `limit` listings are in hand, `maxPages` pages are read, or a
 * page brings fewer than MIN_LISTINGS_FOR_NEXT_PAGE new listings. Before
 * 2026-10-10 every connector read page 1 only, so a sweep saw 34 of Amazon's
 * results per query and missed the rest.
 *
 * A failure on page 1 propagates (the caller treats it as a failed search); a
 * failure on a later page keeps what the earlier pages found.
 */
export async function readResultPages(
  options: ResultPagesOptions,
  readPage: (pageNumber: number) => Promise<RetailerListing[]>,
): Promise<RetailerListing[]> {
  const { limit, maxPages, delayMs = NEXT_PAGE_DELAY_MS, onLaterPageError } = options;
  const wanted = Math.max(1, limit);
  const seen = new Set<string>();
  const out: RetailerListing[] = [];

  for (let pageNumber = 1; pageNumber <= Math.max(1, maxPages) && out.length < wanted; pageNumber++) {
    if (pageNumber > 1 && delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    let listings: RetailerListing[];
    try {
      listings = await readPage(pageNumber);
    } catch (error) {
      if (pageNumber === 1) throw error;
      onLaterPageError?.(pageNumber, error);
      break;
    }

    let fresh = 0;
    for (const listing of listings) {
      if (seen.has(listing.externalId)) continue;
      seen.add(listing.externalId);
      fresh += 1;
      if (out.length < wanted) out.push(listing);
    }
    if (fresh < MIN_LISTINGS_FOR_NEXT_PAGE) break;
  }

  return out;
}

/** `url` with `?<param>=<pageNumber>` set; page 1 is left as the plain URL. */
export function withPageParam(url: string, pageNumber: number, param = 'page'): string {
  if (pageNumber <= 1) return url;
  const parsed = new URL(url);
  parsed.searchParams.set(param, String(pageNumber));
  return parsed.toString();
}

/**
 * Scrolls a results page to the bottom in steps, so cards that load as the
 * shopper scrolls (AliExpress renders about a third of its 60 until then) are
 * in the DOM before it is read. Stops when the page stops growing.
 */
export async function scrollToLoadAll(page: Page, maxSteps = 8, stepPx = 1500, settleMs = 700): Promise<void> {
  let lastHeight = 0;
  for (let step = 0; step < maxSteps; step++) {
    await page.mouse.wheel(0, stepPx);
    await page.waitForTimeout(settleMs);
    const { height, bottom } = await page.evaluate(() => ({
      height: document.body.scrollHeight,
      bottom: window.scrollY + window.innerHeight,
    }));
    if (bottom >= height - 50 && height === lastHeight) break;
    lastHeight = height;
  }
}
