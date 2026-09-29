import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RetailerConnector } from '../interfaces/retailer-connector.interface';
import { RetailerListing } from '../interfaces/retailer-listing.interface';

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

/** The Next.js streamed page data: every `self.__next_f.push([1,"..."])` string, joined. */
function streamedText(html: string): string {
  const chunk = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let text = '';
  for (let match = chunk.exec(html); match; match = chunk.exec(html)) {
    try {
      text += JSON.parse(match[1]) as string;
    } catch {
      // A chunk that isn't a plain string literal carries no results.
    }
  }
  return text;
}

/**
 * The search results embedded in a B.TECH search page. The page is rendered
 * on B.TECH's servers from their discovery API (which does not answer us
 * directly) and ships the result list as React Query state: `"items":[...]`.
 */
export function parseBtechSearchItems(html: string): BtechItem[] {
  const text = streamedText(html);
  const start = text.indexOf('"items":[');
  if (start < 0) return [];
  const open = start + '"items":'.length;
  let depth = 0;
  let inString = false;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '[' || ch === '{') depth += 1;
    else if (ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          const items = JSON.parse(text.slice(open, i + 1)) as unknown;
          return Array.isArray(items) ? (items as BtechItem[]) : [];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
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
