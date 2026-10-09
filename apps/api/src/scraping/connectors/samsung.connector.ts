import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RetailerConnector } from '../interfaces/retailer-connector.interface';
import { RetailerListing } from '../interfaces/retailer-listing.interface';

/** One result from Samsung's store search (the fields we read). */
export interface SamsungResult {
  type?: string;
  modelCode?: string;
  name?: string;
  sale_price?: number;
  msrp_price?: number;
  ecomFlag?: string;
  stockStatus?: string;
  groupedProducts?: string[];
  pdpURL?: string;
  consumerUrl?: string;
  reviewRating?: string;
  numberOfReviews?: string;
  images?: { largeImage?: { url?: string }; smallImage?: { url?: string } };
}

const TIMEOUT_MS = 30_000;
/** The search API answers at most this many results per request. */
const MAX_RESULTS = 25;

function money(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * A result as a listing, or null when it isn't one product at one price:
 * "learn more" entries have no price, and a group of several models (a phone
 * in every storage and color) shows one price for all of them, which would
 * merge the wrong variants.
 */
export function mapSamsungResult(result: SamsungResult, siteUrl: string): RetailerListing | null {
  const model = result.modelCode?.trim();
  // Names carry invisible direction marks (U+200E/U+200F) around sizes.
  const name = result.name?.replace(/[\u200e\u200f]/g, '').replace(/\s+/g, ' ').trim();
  const price = money(result.sale_price);
  if (result.type !== 'Product' || !model || !name || price == null) return null;
  if ((result.groupedProducts?.length ?? 1) > 1) return null;

  const msrp = money(result.msrp_price);
  const path = result.pdpURL || result.consumerUrl || '';
  const rating = Number(result.reviewRating);
  const reviews = Number(result.numberOfReviews);
  return {
    externalId: model,
    externalUrl: new URL(path, siteUrl).toString(),
    // Samsung's names leave out the brand and often the model ("Bottom
    // Mounted Freezer ... 344L"), which matching needs.
    title: `Samsung ${name}${name.includes(model) ? '' : ` ${model}`}`,
    priceUsd: price,
    advertisedPrice: msrp != null && msrp > price ? msrp : null,
    currency: 'EGP',
    brand: 'Samsung',
    model,
    imageUrl: result.images?.largeImage?.url || result.images?.smallImage?.url || null,
    // ecomFlag N: the price is shown but only partner stores sell it.
    inStock: result.ecomFlag === 'Y' && result.stockStatus === 'inStock',
    rating: Number.isFinite(rating) && rating > 0 ? rating : null,
    reviewCount: Number.isFinite(reviews) && reviews > 0 ? reviews : null,
    identifiers: { gtin: null, upc: null, ean: null, mpn: model },
    raw: { modelCode: model, ecomFlag: result.ecomFlag, stockStatus: result.stockStatus },
  };
}

/**
 * Samsung Egypt's own shop (samsung.com/eg): the official price of products
 * every other store also sells. Its search page calls a store-search API
 * that answers plain HTTP when the request looks like it came from the site.
 */
@Injectable()
export class SamsungConnector implements RetailerConnector {
  readonly slug = 'samsung';

  constructor(private readonly configService: ConfigService) {}

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.samsungEnabled', true);
  }

  private get siteUrl(): string {
    return this.configService.get<string>('retailers.samsungBaseUrl', 'https://www.samsung.com');
  }

  private get apiUrl(): string {
    return this.configService.get<string>(
      'retailers.samsungApiUrl',
      'https://sribsrch.ecom.samsung.com/estoresearch-api/v1/scom/search',
    );
  }

  async searchListings(query: string, limit: number): Promise<RetailerListing[]> {
    const body = new URLSearchParams({
      clientCode: 'b2c',
      storeID: 'eg',
      countryCode: 'eg',
      siteCd: 'eg',
      clientName: 'scom',
      version: 'v2',
      startIndex: '0',
      requestCount: String(Math.min(MAX_RESULTS, Math.max(1, limit))),
      projection: '["*"]',
      keyword: query,
      inVokeAISummary: 'false',
      firstSearchYN: 'true',
    });
    const response = await axios.post<{ searchResults?: SamsungResult[] }>(this.apiUrl, body.toString(), {
      timeout: TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://www.samsung.com',
        Referer: 'https://www.samsung.com/',
        // A bare user agent gets Akamai's block page.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      },
    });
    const results = Array.isArray(response.data?.searchResults) ? response.data.searchResults : [];
    return results
      .map((result) => mapSamsungResult(result, this.siteUrl))
      .filter((listing): listing is RetailerListing => listing !== null)
      .slice(0, Math.max(1, limit));
  }
}
