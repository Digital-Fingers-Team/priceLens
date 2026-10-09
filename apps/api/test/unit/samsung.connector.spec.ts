import { mapSamsungResult } from '../../src/scraping/connectors/samsung.connector';

/** Trimmed from a real sribsrch.ecom.samsung.com search answer (2026-10-09). */
const fridge = {
  type: 'Product',
  modelCode: 'RB34C671ES9/MR',
  name: 'Bottom Mounted Freezer SmartThings AI Energy 344L',
  sale_price: 30999,
  msrp_price: 30999,
  ecomFlag: 'Y',
  stockStatus: 'inStock',
  groupedProducts: ['RB34C671ES9/MR'],
  pdpURL: '/eg/refrigerators/bottom-mount-freezer/bottom-mount-freezer-344l-refined-inox-rb34c671es9-mr/',
  reviewRating: '5.0',
  numberOfReviews: '1',
  images: { largeImage: { url: 'https://images.samsung.com/is/image/samsung/p6pim/eg/rb34c671es9-mr/gallery/a' } },
};

const SITE = 'https://www.samsung.com';

describe('mapSamsungResult', () => {
  it('maps a product with the brand and model in the title, at the sale price', () => {
    expect(mapSamsungResult(fridge, SITE)).toMatchObject({
      externalId: 'RB34C671ES9/MR',
      externalUrl: `${SITE}${fridge.pdpURL}`,
      title: 'Samsung Bottom Mounted Freezer SmartThings AI Energy 344L RB34C671ES9/MR',
      priceUsd: 30999,
      advertisedPrice: null,
      brand: 'Samsung',
      model: 'RB34C671ES9/MR',
      inStock: true,
      identifiers: { mpn: 'RB34C671ES9/MR' },
    });
  });

  it('drops the invisible direction marks Samsung puts around sizes', () => {
    expect(mapSamsungResult({ ...fridge, name: '\u200e43 Inch\u200e  Full HD TV' }, SITE)?.title).toBe('Samsung 43 Inch Full HD TV RB34C671ES9/MR');
  });

  it('keeps a higher MSRP as the struck-through price', () => {
    expect(mapSamsungResult({ ...fridge, sale_price: 27999 }, SITE)).toMatchObject({ priceUsd: 27999, advertisedPrice: 30999 });
  });

  it('is not in stock when only partner stores sell it (ecomFlag N)', () => {
    expect(mapSamsungResult({ ...fridge, ecomFlag: 'N' }, SITE)?.inStock).toBe(false);
  });

  it('skips "learn more" entries with no price, and one price shown for a group of models', () => {
    expect(mapSamsungResult({ ...fridge, sale_price: undefined }, SITE)).toBeNull();
    expect(mapSamsungResult({ ...fridge, groupedProducts: ['SM-S938BZBIMEA', 'SM-S938BZKIMEA'] }, SITE)).toBeNull();
    expect(mapSamsungResult({ ...fridge, type: 'Support' }, SITE)).toBeNull();
  });
});
