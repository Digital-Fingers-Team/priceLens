import { mapSigmaItem, parseSigmaSearchItems, sigmaSearchUrl } from '../../src/scraping/connectors/sigma.connector';

/** Trimmed from a real sigma-computer.com /en/search?q=rtx item (2026-10-09). */
const item = {
  id: 'a0e38061-a831-47b7-837f-5e5422bf42ff',
  slug: 'pny-geforce-rtx-5060-ti-8gb-overclocked-dual-fan-graphics-card-7jz4piwt2y4z',
  name: 'PNY GeForce RTX 5060 Ti 8GB Overclocked Dual Fan Graphics Card',
  sku: 'PNY-RTX5060Ti-8GB',
  price: { base: 22499, current: 26500, discount_percentage: 0, currency: 'EGP' },
  thumbnail: { url: 'https://api.sigma-computer.com/media/3385ceea' },
  brand: { name: 'PNY' },
  is_stock: true,
};

/** A search page as Next.js streams it: the data is a JSON string inside a push call. */
function page(products: unknown[]): string {
  const flight = `1a:["$","$L3b",null,{"products":${JSON.stringify(products)},"meta":{"page":1}}]`;
  return `<html><script>self.__next_f.push([1,${JSON.stringify(flight)}])</script></html>`;
}

const SITE = 'https://www.sigma-computer.com';

describe('Sigma connector', () => {
  it('reads the results embedded in the search page', () => {
    expect(parseSigmaSearchItems(page([item, { ...item, id: 'b' }]))).toHaveLength(2);
    expect(parseSigmaSearchItems('<html>no stream</html>')).toEqual([]);
  });

  it('sells at the current price; a lower, stale base is not a discount', () => {
    expect(mapSigmaItem(item, SITE)).toMatchObject({
      externalId: item.id,
      externalUrl: `${SITE}/en/item?id=${item.slug}`,
      title: item.name,
      priceUsd: 26500,
      advertisedPrice: null,
      currency: 'EGP',
      brand: 'PNY',
      inStock: true,
      identifiers: { mpn: 'PNY-RTX5060Ti-8GB' },
    });
  });

  it('keeps a higher base as the struck-through price', () => {
    const discounted = { ...item, price: { base: 5999, current: 4499, currency: 'EGP' } };
    expect(mapSigmaItem(discounted, SITE)).toMatchObject({ priceUsd: 4499, advertisedPrice: 5999 });
  });

  it('searches the English results page', () => {
    expect(sigmaSearchUrl(SITE, 'rtx 5060')).toBe(`${SITE}/en/search?q=rtx+5060`);
  });
});
