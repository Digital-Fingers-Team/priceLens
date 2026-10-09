import {
  homzmartSearchUrl,
  mapHomzmartItem,
  parseHomzmartSearchItems,
} from '../../src/scraping/connectors/homzmart.connector';

/** Trimmed from a real homzmart.com /en/search?search=samsung+refrigerator item (2026-10-09). */
const item = {
  id: 290541,
  sku: 'GOALA101360006',
  name: 'Samsung No-Frost Refrigerator 340 L Silver - RB34C671ES9/MR',
  url_key: 'samsung-no-frost-refrigerator-340-l-silver-rb34c671es9mr--GOALA101360006',
  stock_status: 'IN_STOCK',
  barcode_ean: null,
  image: { url: 'https://eg-rv.homzmart.net/catalog/product/G/O/GOALA101360006-ENV_thumb.jpg' },
  price_range: {
    minimum_price: { regular_price: { value: 30319, currency: 'EGP' }, final_price: { value: 30319, currency: 'EGP' } },
  },
};

function page(items: unknown[]): string {
  const data = { props: { pageProps: { initialData: { products: { total_count: items.length, items } } } } };
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
}

const SITE = 'https://homzmart.com';

describe('Homzmart connector', () => {
  it('reads the results from __NEXT_DATA__', () => {
    expect(parseHomzmartSearchItems(page([item]))).toHaveLength(1);
    expect(parseHomzmartSearchItems('<html></html>')).toEqual([]);
  });

  it('maps a result to a listing at its final price', () => {
    expect(mapHomzmartItem(item, SITE)).toMatchObject({
      externalId: 'GOALA101360006',
      externalUrl: `${SITE}/en/p/${item.url_key}`,
      title: item.name,
      priceUsd: 30319,
      advertisedPrice: null,
      currency: 'EGP',
      inStock: true,
      identifiers: { ean: null },
    });
  });

  it('keeps a higher regular price as the struck-through price, and the barcode', () => {
    const sale = {
      ...item,
      barcode_ean: '8806094767046',
      price_range: { minimum_price: { regular_price: { value: 34000 }, final_price: { value: 30319, currency: 'EGP' } } },
    };
    expect(mapHomzmartItem(sale, SITE)).toMatchObject({
      advertisedPrice: 34000,
      identifiers: { gtin: '8806094767046', ean: '8806094767046' },
    });
  });

  it('searches with the "search" parameter', () => {
    expect(homzmartSearchUrl(SITE, 'sofa bed')).toBe(`${SITE}/en/search?search=sofa+bed`);
  });
});
