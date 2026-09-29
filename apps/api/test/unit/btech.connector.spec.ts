import { btechSearchUrl, mapBtechItem, parseBtechSearchItems } from '../../src/scraping/connectors/btech.connector';

/** Trimmed from a real btech.com /en/s?q=samsung%20refrigerator item (2026-09-29). */
const item = {
  variant_id: '103e2e43-2ed3-4790-9b64-5d4abf766c20',
  product_id: 'a543bc18-69b5-419d-83c1-b16157576c74',
  offer_id: '5811f123-4dfe-4bda-9aa3-20cab6638e8e',
  sku: '1MSAREFSB34C671EF008',
  name: 'Samsung NoFrost Bottom Freezer Refrigerator , 344 Liter Inverter Motor , Silver - RB34C671ES9/MR',
  brand: 'Samsung',
  thumbnail_url: 'd/8/a/3/d8a36fd08f67c496288410a57144069709ae03e7_samsung.jpeg',
  price: { final_price: 27999, base_price: 31632 },
  is_in_stock: true,
};

/** How Next.js streams page data: JSON text split across escaped push() string chunks. */
function page(payload: string): string {
  const half = Math.floor(payload.length / 2);
  const chunk = (text: string) => `<script>self.__next_f.push([1,${JSON.stringify(text)}])</script>`;
  return `<html><body>${chunk(payload.slice(0, half))}${chunk(payload.slice(half))}</body></html>`;
}

describe('parseBtechSearchItems', () => {
  it('reads the result items out of the streamed page data, across chunks', () => {
    const html = page(`0:["$","div",{"state":{"queries":[{"state":{"data":{"pages":[{"items":${JSON.stringify([item, { ...item, offer_id: 'o2' }])},"total":745}]}}}]}}]`);
    expect(parseBtechSearchItems(html).map((i) => i.offer_id)).toEqual([item.offer_id, 'o2']);
  });

  it('returns no items for a page without results', () => {
    expect(parseBtechSearchItems(page('0:["$","div",{"children":"no_search_result_new_title"}]'))).toEqual([]);
    expect(parseBtechSearchItems('<html>blocked</html>')).toEqual([]);
  });
});

describe('mapBtechItem', () => {
  it('maps an item to an EGP listing with its product page and was-price', () => {
    expect(mapBtechItem(item)).toMatchObject({
      externalId: item.offer_id,
      externalUrl: `https://btech.com/en/p/${item.product_id}?offering_id=${item.offer_id}`,
      title: item.name,
      priceUsd: 27999,
      advertisedPrice: 31632,
      currency: 'EGP',
      brand: 'Samsung',
      imageUrl: `https://media.btech.com/catalogs/${item.thumbnail_url}`,
      inStock: true,
      identifiers: { gtin: null, upc: null, ean: null, mpn: null },
    });
  });

  it('claims no discount when the base price is not higher, and no price when there is none', () => {
    expect(mapBtechItem({ ...item, price: { final_price: 32652, base_price: 32652 } }).advertisedPrice).toBeNull();
    expect(mapBtechItem({ ...item, price: { final_price: 0 } }).priceUsd).toBeNull();
  });
});

describe('btechSearchUrl', () => {
  it('uses the English search page', () => {
    expect(btechSearchUrl('samsung refrigerator')).toBe('https://btech.com/en/s?q=samsung+refrigerator');
  });
});
