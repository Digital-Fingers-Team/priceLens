import { mapShopifyProduct, shopifySuggestUrl } from '../../src/scraping/connectors/shopify-search.connector';

/** Trimmed from a real dream2000.com /en/search/suggest.json answer (2026-09-29). */
const product = {
  available: true,
  compare_at_price_max: '35400.00',
  handle: 'lg-refrigerator-top-freezer-401l-inverter-no-frost-gtf402svan-platinum-silver',
  id: 8255179522187,
  image: 'https://cdn.shopify.com/s/files/1/0741/2557/4283/files/lg.jpg?v=1',
  price: '32999.00',
  tags: ['LG', 'Refrigerators'],
  title: 'LG Refrigerator Top Freezer 401 L Inverter No GTF402SVAN',
  type: 'Refrigerators',
  url: '/en/products/lg-refrigerator-top-freezer-401l-inverter-no-frost-gtf402svan-platinum-silver?_pos=3&_psq=samsung+refrigerator&_psid=2ae62b89e&_ss=e',
  vendor: 'LG',
};

describe('mapShopifyProduct', () => {
  it('maps a Shopify predictive-search product to a listing, in the store currency', () => {
    expect(mapShopifyProduct(product, 'https://dream2000.com', 'EGP')).toMatchObject({
      externalId: '8255179522187',
      externalUrl: 'https://dream2000.com/en/products/lg-refrigerator-top-freezer-401l-inverter-no-frost-gtf402svan-platinum-silver',
      title: 'LG Refrigerator Top Freezer 401 L Inverter No GTF402SVAN',
      priceUsd: 32999,
      advertisedPrice: 35400,
      currency: 'EGP',
      brand: 'LG',
      imageUrl: 'https://cdn.shopify.com/s/files/1/0741/2557/4283/files/lg.jpg?v=1',
      inStock: true,
    });
  });

  it('claims no discount when the "was" price is missing or not higher', () => {
    expect(mapShopifyProduct({ ...product, compare_at_price_max: '0.00' }, 'https://dream2000.com', 'EGP').advertisedPrice).toBeNull();
    expect(mapShopifyProduct({ ...product, compare_at_price_max: '32999.00' }, 'https://dream2000.com', 'EGP').advertisedPrice).toBeNull();
  });

  it('gives no price rather than 0 for a missing or zero price', () => {
    expect(mapShopifyProduct({ ...product, price: '0.00' }, 'https://dream2000.com', 'EGP').priceUsd).toBeNull();
    expect(mapShopifyProduct({ ...product, price: undefined }, 'https://dream2000.com', 'EGP').priceUsd).toBeNull();
  });

  it('falls back to featured_image and leaves out an empty vendor', () => {
    const listing = mapShopifyProduct(
      { ...product, image: undefined, featured_image: { url: 'https://cdn.example/f.jpg' }, vendor: '' },
      'https://dream2000.com',
      'EGP',
    );
    expect([listing.imageUrl, listing.brand]).toEqual(['https://cdn.example/f.jpg', null]);
  });
});

describe('shopifySuggestUrl', () => {
  it('asks the locale-prefixed predictive search for products, at most 10 (the Shopify cap)', () => {
    const url = new URL(shopifySuggestUrl('https://dream2000.com/', 'en', 'lg fridge', 50));
    expect(url.pathname).toBe('/en/search/suggest.json');
    expect(url.searchParams.get('q')).toBe('lg fridge');
    expect(url.searchParams.get('resources[type]')).toBe('product');
    expect(url.searchParams.get('resources[limit]')).toBe('10');
  });
});

describe('shopifySuggestUrl', () => {
  it('serves a shop on its default locale without a prefix (Tradeline, Compumarts)', () => {
    expect(shopifySuggestUrl('https://tradelinestores.com', '', 'iphone 15', 5)).toBe(
      'https://tradelinestores.com/search/suggest.json?q=iphone+15&resources%5Btype%5D=product&resources%5Blimit%5D=5',
    );
    expect(shopifySuggestUrl('https://dream2000.com', 'en', 'tv', 50)).toContain('/en/search/suggest.json?q=tv');
  });
});
