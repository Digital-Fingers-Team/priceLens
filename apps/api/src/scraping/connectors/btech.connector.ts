import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RetailerConnector } from '../interfaces/retailer-connector.interface';
import { RetailerListing } from '../interfaces/retailer-listing.interface';
import { firstJsonArray, streamedText } from '../utils/next-flight';

/** One search result, as B.TECH's search page embeds it (the fields we read). */
export interface BtechItem {
  product_id?: string;
  offer_id?: string;
  sku?: string;
  name?: string;
  brand?: string;
  thumbnail_url?: string;
  price?: { final_price?: number; base_price?: number };
  is_in_stock?: boolean;
}

const SITE = 'https://btech.com';
const MEDIA = 'https://media.btech.com/catalogs/';
const TIMEOUT_MS = 30_000;

export function btechSearchUrl(query: string): string {
  return `${SITE}/en/s?${new URLSearchParams({ q: query }).toString()}`;
}

/**
 * The search results embedded in a B.TECH search page. The page is rendered
 * on B.TECH's servers from their discovery API (which does not answer us
 * directly) and ships the result list as React Query state: `"items":[...]`.
 */
export function parseBtechSearchItems(html: string): BtechItem[] {
  return firstJsonArray<BtechItem>(streamedText(html), 'items');
}

function money(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function mapBtechItem(item: BtechItem): RetailerListing {
  const price = money(item.price?.final_price);
  const base = money(item.price?.base_price);
  const offer = item.offer_id ?? '';
  return {
    externalId: offer || item.sku || item.product_id || '',
    externalUrl: `${SITE}/en/p/${item.product_id ?? ''}${offer ? `?offering_id=${offer}` : ''}`,
    title: (item.name ?? '').trim(),
    priceUsd: price,
    advertisedPrice: price != null && base != null && base > price ? base : null,
    currency: 'EGP',
    brand: item.brand?.trim() || null,
    model: null,
    imageUrl: item.thumbnail_url ? `${MEDIA}${item.thumbnail_url}` : null,
    inStock: typeof item.is_in_stock === 'boolean' ? item.is_in_stock : null,
    rating: null,
    reviewCount: null,
    identifiers: { gtin: null, upc: null, ean: null, mpn: null },
    raw: { sku: item.sku, productId: item.product_id, offerId: item.offer_id },
  };
}

/**
 * B.TECH (btech.com). Plain HTTP: its search page (`/en/s?q=`) carries the
 * first page of results (20) as embedded data.
 */
@Injectable()
export class BtechConnector implements RetailerConnector {
  private readonly logger = new Logger(BtechConnector.name);
  readonly slug = 'btech';

  constructor(private readonly configService: ConfigService) {}

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.btechEnabled', true);
  }

  async searchListings(query: string, limit: number): Promise<RetailerListing[]> {
    const response = await axios.get<string>(btechSearchUrl(query), {
      timeout: TIMEOUT_MS,
      responseType: 'text',
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      },
    });
    return parseBtechSearchItems(response.data)
      .map(mapBtechItem)
      .filter((listing) => listing.title.length > 0 && listing.externalId.length > 0)
      .slice(0, Math.max(1, limit));
  }
}
