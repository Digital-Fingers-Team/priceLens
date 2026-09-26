import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RetailerConnector } from '../interfaces/retailer-connector.interface';
import { RetailerListing } from '../interfaces/retailer-listing.interface';
import { BrowserSessionService } from '../browser/browser-session.service';
import { isBotWallRefusal, openThroughBotWall } from '../browser/bot-wall';

interface MagentoMoney {
  value?: number;
  currency?: string;
}

interface MagentoProductItem {
  name?: string;
  sku?: string;
  url_key?: string;
  url_suffix?: string;
  stock_status?: string;
  rating_summary?: number;
  review_count?: number;
  small_image?: { url?: string };
  price_range?: {
    minimum_price?: {
      final_price?: MagentoMoney;
    };
  };
}

interface MagentoSearchResponse {
  data?: {
    products?: {
      items?: MagentoProductItem[];
    };
  };
  errors?: Array<{ message?: string }>;
}

/** Matches the HTTP path's timeout. */
const IN_PAGE_FETCH_TIMEOUT_MS = 30_000;

const SEARCH_QUERY = `
  query SearchProducts($search: String!, $pageSize: Int!) {
    products(search: $search, pageSize: $pageSize) {
      items {
        name
        sku
        url_key
        url_suffix
        stock_status
        rating_summary
        review_count
        small_image { url }
        price_range {
          minimum_price {
            final_price { value currency }
          }
        }
      }
    }
  }
`;

/**
 * Connector for stores running Magento (Adobe Commerce), which exposes its public
 * storefront catalog through an unauthenticated GraphQL endpoint at `<baseUrl>/graphql` —
 * the same API the store's own frontend calls to render search results.
 */
export abstract class MagentoGraphqlConnector implements RetailerConnector {
  protected readonly logger = new Logger(this.constructor.name);

  abstract readonly slug: string;
  abstract readonly isEnabled: boolean;
  protected abstract readonly defaultCurrency: string;
  protected abstract get baseUrl(): string;
  /** Magento store-view code, used both as the `Store` header and the URL path prefix. */
  protected readonly storeCode: string = 'en';

  constructor(
    protected readonly configService: ConfigService,
    /** Enables the browser fallback for stores behind a bot wall (see fetchProducts). */
    protected readonly browserSession?: BrowserSessionService,
  ) {}

  async searchListings(query: string, limit: number): Promise<RetailerListing[]> {
    if (!this.isEnabled) return [];

    const trimmed = query.trim();
    if (!trimmed) return [];

    try {
      const items = await this.fetchProducts(trimmed, Math.max(1, limit));
      const listings: RetailerListing[] = [];
      for (const item of items) {
        const mapped = this.mapItem(item);
        if (mapped) listings.push(mapped);
      }
      return listings;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Search failed for "${query}" (${this.slug}): ${message}`);
      return [];
    }
  }

  /**
   * Plain HTTP first; on a bot-wall refusal (2B sits behind a Cloudflare
   * challenge that answers every non-browser request with 403), the same
   * GraphQL call is made from inside a real browser page on the store's own
   * origin, which has passed the challenge and carries its clearance cookie.
   */
  private async fetchProducts(search: string, pageSize: number): Promise<MagentoProductItem[]> {
    try {
      return await this.fetchProductsOverHttp(search, pageSize);
    } catch (error) {
      if (!this.browserSession || !isBotWallRefusal(error)) throw error;
      return this.fetchProductsInBrowser(search, pageSize);
    }
  }

  private async fetchProductsInBrowser(search: string, pageSize: number): Promise<MagentoProductItem[]> {
    const base = this.baseUrl.replace(/\/$/, '');
    const page = await this.browserSession!.getPage(this.slug);
    try {
      // Any same-origin page works; robots.txt is the lightest one the
      // challenge will redirect back to once it clears.
      await openThroughBotWall(page, `${base}/robots.txt`);
      const result = await page.evaluate(
        async ({ endpoint, body, store, timeoutMs }) => {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Store: store },
            body,
            signal: AbortSignal.timeout(timeoutMs),
          });
          return { status: response.status, text: await response.text() };
        },
        {
          endpoint: `${base}/graphql`,
          body: JSON.stringify({ query: SEARCH_QUERY, variables: { search, pageSize } }),
          store: this.storeCode,
          // page.evaluate has no timeout of its own: a hung call would hang the job (B-19).
          timeoutMs: IN_PAGE_FETCH_TIMEOUT_MS,
        },
      );
      if (result.status !== 200) {
        throw new Error(`GraphQL through the browser returned ${result.status}`);
      }
      const data = JSON.parse(result.text) as MagentoSearchResponse;
      if (data.errors?.length) {
        throw new Error(data.errors.map((err) => err.message).join('; '));
      }
      return data.data?.products?.items ?? [];
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  private async fetchProductsOverHttp(search: string, pageSize: number): Promise<MagentoProductItem[]> {
    const endpoint = `${this.baseUrl.replace(/\/$/, '')}/graphql`;
    const response = await axios.post<MagentoSearchResponse>(
      endpoint,
      { query: SEARCH_QUERY, variables: { search, pageSize } },
      {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          Store: this.storeCode,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      },
    );

    if (response.data?.errors?.length) {
      throw new Error(response.data.errors.map((err) => err.message).join('; '));
    }

    return response.data?.data?.products?.items ?? [];
  }

  private mapItem(item: MagentoProductItem): RetailerListing | null {
    const title = item.name?.trim();
    const sku = item.sku?.trim();
    if (!title || !sku) return null;

    const finalPrice = item.price_range?.minimum_price?.final_price;
    const price = typeof finalPrice?.value === 'number' && Number.isFinite(finalPrice.value)
      ? finalPrice.value
      : null;

    return {
      externalId: sku,
      externalUrl: this.buildProductUrl(item),
      title,
      priceUsd: price,
      currency: finalPrice?.currency?.trim() || this.defaultCurrency,
      brand: null,
      model: null,
      imageUrl: item.small_image?.url?.trim() || null,
      inStock: item.stock_status == null ? null : item.stock_status === 'IN_STOCK',
      // rating_summary is a 0-100 percentage; convert to a 0-5 scale
      rating:
        item.rating_summary && item.rating_summary > 0 ? (item.rating_summary / 100) * 5 : null,
      reviewCount: item.review_count && item.review_count > 0 ? item.review_count : null,
      identifiers: { gtin: null, upc: null, ean: null, mpn: sku },
      raw: item as unknown as Record<string, unknown>,
    };
  }

  private buildProductUrl(item: MagentoProductItem): string {
    const base = this.baseUrl.replace(/\/$/, '');
    if (!item.url_key) return base;
    const suffix = item.url_suffix ?? '';
    return `${base}/${this.storeCode}/${item.url_key}${suffix}`;
  }
}
