import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RetailerConnector } from '../interfaces/retailer-connector.interface';
import { RetailerListing } from '../interfaces/retailer-listing.interface';

/** One product in a Shopify predictive-search answer (the fields we read). */
export interface ShopifySuggestProduct {
  id?: number | string;
  title?: string;
  url?: string;
  price?: string;
  compare_at_price_max?: string;
  available?: boolean;
  vendor?: string;
  image?: string;
  featured_image?: { url?: string };
  handle?: string;
  type?: string;
  tags?: string[];
}

interface ShopifySuggestResponse {
  resources?: { results?: { products?: ShopifySuggestProduct[] } };
}

/** Shopify's predictive search returns at most 10 products per query. */
const SHOPIFY_SUGGEST_MAX = 10;
const TIMEOUT_MS = 30_000;

/** The store's predictive-search URL for `query`. */
export function shopifySuggestUrl(baseUrl: string, locale: string, query: string, limit: number): string {
  const url = new URL(`/${locale}/search/suggest.json`, baseUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('resources[type]', 'product');
  url.searchParams.set('resources[limit]', String(Math.max(1, Math.min(limit, SHOPIFY_SUGGEST_MAX))));
  return url.toString();
}

function money(value: string | undefined): number | null {
  const amount = value == null ? NaN : Number.parseFloat(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/** A predictive-search product as a listing. Prices are in the store's own currency. */
export function mapShopifyProduct(product: ShopifySuggestProduct, baseUrl: string, currency: string): RetailerListing {
  const price = money(product.price);
  const was = money(product.compare_at_price_max);
  // The URL carries search-tracking parameters (_pos, _psq...); the product is the path.
  const path = (product.url ?? `/products/${product.handle ?? ''}`).split('?')[0];
  return {
    externalId: String(product.id ?? product.handle ?? path),
    externalUrl: new URL(path, baseUrl).toString(),
    title: (product.title ?? '').trim(),
    priceUsd: price,
    advertisedPrice: price != null && was != null && was > price ? was : null,
    currency,
    brand: product.vendor?.trim() || null,
    model: null,
    imageUrl: product.image || product.featured_image?.url || null,
    inStock: typeof product.available === 'boolean' ? product.available : null,
    rating: null,
    reviewCount: null,
    identifiers: { gtin: null, upc: null, ean: null, mpn: null },
    raw: { id: product.id, handle: product.handle, type: product.type, tags: product.tags },
  };
}

/**
 * Connector for stores on Shopify, through the storefront's public
 * predictive-search endpoint (`/<locale>/search/suggest.json`) -- the JSON the
 * store's own search box calls. Plain HTTP, no browser. At most 10 products
 * per query (a Shopify limit).
 */
export abstract class ShopifySearchConnector implements RetailerConnector {
  protected readonly logger = new Logger(this.constructor.name);

  abstract readonly slug: string;
  abstract readonly isEnabled: boolean;
  protected abstract readonly defaultCurrency: string;
  protected abstract get baseUrl(): string;
  /** Some shops answer only with a locale prefix ("Unsupported buyer locale" otherwise). */
  protected readonly locale: string = 'en';

  constructor(protected readonly configService: ConfigService) {}

  async searchListings(query: string, limit: number): Promise<RetailerListing[]> {
    const response = await axios.get<ShopifySuggestResponse>(shopifySuggestUrl(this.baseUrl, this.locale, query, limit), {
      timeout: TIMEOUT_MS,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      },
    });
    const products = response.data?.resources?.results?.products ?? [];
    return products
      .map((product) => mapShopifyProduct(product, this.baseUrl, this.defaultCurrency))
      .filter((listing) => listing.title.length > 0);
  }
}
