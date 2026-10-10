import { RetailerListing } from '../../src/scraping/interfaces/retailer-listing.interface';
import { MIN_LISTINGS_FOR_NEXT_PAGE, readResultPages, withPageParam } from '../../src/scraping/utils/result-pages';

function listings(prefix: string, count: number): RetailerListing[] {
  return Array.from({ length: count }, (_, i) => ({ externalId: `${prefix}${i}` }) as RetailerListing);
}

describe('readResultPages', () => {
  it('reads further pages until the limit is reached', async () => {
    const read = jest.fn(async (n: number) => listings(`p${n}-`, 30));
    const out = await readResultPages({ limit: 50, maxPages: 3, delayMs: 0 }, read);
    expect(out).toHaveLength(50);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('stops at maxPages', async () => {
    const read = jest.fn(async (n: number) => listings(`p${n}-`, 20));
    expect(await readResultPages({ limit: 100, maxPages: 2, delayMs: 0 }, read)).toHaveLength(40);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('stops after a short page: a narrow query fits on page 1', async () => {
    const read = jest.fn(async (n: number) => listings(`p${n}-`, MIN_LISTINGS_FOR_NEXT_PAGE - 1));
    expect(await readResultPages({ limit: 50, maxPages: 3, delayMs: 0 }, read)).toHaveLength(MIN_LISTINGS_FOR_NEXT_PAGE - 1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('stops when a page repeats the previous one (the store ignored the page number)', async () => {
    const read = jest.fn(async () => listings('same-', 20));
    expect(await readResultPages({ limit: 50, maxPages: 3, delayMs: 0 }, read)).toHaveLength(20);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('keeps earlier pages when a later page fails, but a failed page 1 throws', async () => {
    const onError = jest.fn();
    const read = jest.fn(async (n: number) => {
      if (n === 2) throw new Error('timeout');
      return listings(`p${n}-`, 20);
    });
    expect(await readResultPages({ limit: 50, maxPages: 3, delayMs: 0, onLaterPageError: onError }, read)).toHaveLength(20);
    expect(onError).toHaveBeenCalledWith(2, expect.any(Error));

    await expect(readResultPages({ limit: 50, maxPages: 3, delayMs: 0 }, async () => Promise.reject(new Error('blocked')))).rejects.toThrow('blocked');
  });

  it('reads one page when maxPages is 1', async () => {
    const read = jest.fn(async (n: number) => listings(`p${n}-`, 20));
    expect(await readResultPages({ limit: 50, maxPages: 1, delayMs: 0 }, read)).toHaveLength(20);
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('withPageParam', () => {
  it('leaves page 1 alone and sets the parameter on later pages', () => {
    expect(withPageParam('https://www.amazon.eg/s?k=tv', 1)).toBe('https://www.amazon.eg/s?k=tv');
    expect(withPageParam('https://www.amazon.eg/s?k=tv', 2)).toBe('https://www.amazon.eg/s?k=tv&page=2');
    expect(withPageParam('https://x.com/w/wholesale-tv.html', 3)).toBe('https://x.com/w/wholesale-tv.html?page=3');
  });
});
