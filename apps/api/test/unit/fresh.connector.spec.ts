import axios from 'axios';
import type { ConfigService } from '@nestjs/config';
import { FreshConnector } from '../../src/scraping/connectors/fresh.connector';

jest.mock('axios');

/** Trimmed from a real freshmprod.hypernode.io/graphql answer (2026-10-09). */
const item = {
  name: 'Fresh Gas Cooker Built In Glass -  HFR60CMGC1',
  sku: '500009617',
  url_key: 'fresh-gas-cooker-built-in-hafr60cmms1-5',
  url_suffix: '.html',
  stock_status: 'IN_STOCK',
  price_range: { minimum_price: { final_price: { value: 9796.12, currency: 'EGP' } } },
};

const config = { get: (_key: string, fallback: unknown) => fallback } as unknown as ConfigService;

describe('FreshConnector', () => {
  it('asks the API host with the "default" store view and links to /en/products/<url_key>', async () => {
    const post = jest.mocked(axios.post).mockResolvedValue({ data: { data: { products: { items: [item] } } } });

    const [listing] = await new FreshConnector(config).searchListings('cooker', 5);

    expect(post.mock.calls[0][0]).toBe('https://freshmprod.hypernode.io/graphql');
    expect((post.mock.calls[0][2] as { headers: Record<string, string> }).headers.Store).toBe('default');
    expect(listing).toMatchObject({
      externalId: '500009617',
      externalUrl: 'https://fresh.com.eg/en/products/fresh-gas-cooker-built-in-hafr60cmms1-5',
      priceUsd: 9796.12,
      currency: 'EGP',
      inStock: true,
    });
  });
});
