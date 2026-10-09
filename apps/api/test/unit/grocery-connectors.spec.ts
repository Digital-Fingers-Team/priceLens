import axios from 'axios';
import type { ConfigService } from '@nestjs/config';
import { GourmetConnector } from '../../src/scraping/connectors/gourmet.connector';
import { SpinneysConnector } from '../../src/scraping/connectors/spinneys.connector';

jest.mock('axios');

const config = { get: (_key: string, fallback: unknown) => fallback } as unknown as ConfigService;
const money = (value: number) => ({ minimum_price: { final_price: { value, currency: 'EGP' } } });
const answer = (items: unknown[]) => ({ data: { data: { products: { items } } } });

describe('GourmetConnector', () => {
  it('adds the size from the URL key when the name leaves it out, and matches by barcode', async () => {
    // Real gourmetegypt.com answers (2026-10-09): both are "Juhayna Skimmed Milk".
    jest.mocked(axios.post).mockResolvedValue(
      answer([
        { name: 'Juhayna Skimmed Milk', sku: '6223000350201', url_key: 'juhayna-skimmed-milk-200ml', url_suffix: '', stock_status: 'IN_STOCK', price_range: money(15) },
        { name: 'Basmati Rice', sku: '6221234567890', url_key: 'basmati-rice-1-kg', url_suffix: '', stock_status: 'IN_STOCK', price_range: money(120) },
        { name: 'Juhayna Skimmed Milk', sku: '6223000350089', url_key: 'juhayna-skimmed-milk', url_suffix: '', stock_status: 'IN_STOCK', price_range: money(52) },
        { name: 'Pepsi Can 330ml', sku: '6223001360261', url_key: 'pepsi-can-330-ml', url_suffix: '', stock_status: 'IN_STOCK', price_range: money(17) },
      ]),
    );

    const listings = await new GourmetConnector(config).searchListings('milk', 10);

    expect(listings.map((listing) => listing.title)).toEqual([
      'Juhayna Skimmed Milk 200ml',
      'Basmati Rice 1kg',
      'Juhayna Skimmed Milk',
      'Pepsi Can 330ml',
    ]);
    expect(listings[0]).toMatchObject({
      externalUrl: 'https://gourmetegypt.com/juhayna-skimmed-milk-200ml',
      identifiers: { gtin: '6223000350201', ean: '6223000350201', mpn: null },
    });
  });
});

describe('SpinneysConnector', () => {
  it('asks over GET with the "default" store view and links to /en/<url_key>', async () => {
    const get = jest.mocked(axios.get).mockResolvedValue(
      answer([
        { name: 'Juhayna Milk Full Cream - 1L', sku: '125343', url_key: 'juhayna-milk-full-cream-1-l', url_suffix: '.html', stock_status: 'IN_STOCK', price_range: money(49.95) },
      ]),
    );

    const [listing] = await new SpinneysConnector(config).searchListings('milk', 5);

    expect(get.mock.calls[0][0]).toBe('https://www.spinneys-egypt.com/graphql');
    const options = get.mock.calls[0][1] as { headers: Record<string, string>; params: { variables: string } };
    expect(options.headers.Store).toBe('default');
    expect(JSON.parse(options.params.variables)).toEqual({ search: 'milk', pageSize: 5 });
    expect(listing).toMatchObject({
      externalUrl: 'https://www.spinneys-egypt.com/en/juhayna-milk-full-cream-1-l',
      priceUsd: 49.95,
      identifiers: { gtin: null, mpn: '125343' },
    });
  });

  it('is probed with grocery words, not "samsung,tv"', () => {
    expect(new SpinneysConnector(config).probeQuery).toBe('milk,water');
  });
});
