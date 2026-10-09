import axios from 'axios';
import type { ConfigService } from '@nestjs/config';
import { RayaConnector } from '../../src/scraping/connectors/raya.connector';

jest.mock('axios');

/** Trimmed from a real api-rayashop.global.ssl.fastly.net/graphql answer (2026-10-09). */
const item = {
  name: 'SAMSUNG 65 Inch DUE800 Series 4K UHD Smart LED TV with Built In Receiver - UA65DUE800',
  sku: 'UA65DUE800',
  url_key: 'samsung-65-inch-due800-series-4k-uhd-smart-led-tv-with-built-in-receiver-ua65due800-3',
  url_suffix: '.html',
  stock_status: 'IN_STOCK',
  small_image: { url: 'https://prod-fastly.rayashop.com/media/catalog/product/g/h/tv.jpg' },
  price_range: { minimum_price: { final_price: { value: 25999, currency: 'EGP' } } },
};

const config = { get: (_key: string, fallback: unknown) => fallback } as unknown as ConfigService;

describe('RayaConnector', () => {
  it('asks the API host and links to the product page on the site host, without ".html"', async () => {
    const post = jest.mocked(axios.post).mockResolvedValue({ data: { data: { products: { items: [item] } } } });

    const [listing] = await new RayaConnector(config).searchListings('samsung tv', 5);

    expect(post.mock.calls[0][0]).toBe('https://api-rayashop.global.ssl.fastly.net/graphql');
    expect(listing).toMatchObject({
      externalId: 'UA65DUE800',
      externalUrl:
        'https://www.rayashop.com/en/samsung-65-inch-due800-series-4k-uhd-smart-led-tv-with-built-in-receiver-ua65due800-3',
      priceUsd: 25999,
      currency: 'EGP',
      inStock: true,
    });
  });
});
