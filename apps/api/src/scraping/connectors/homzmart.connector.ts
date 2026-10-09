import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RetailerConnector } from '../interfaces/retailer-connector.interface';
import { RetailerListing } from '../interfaces/retailer-listing.interface';

interface Money {
  value?: number;
  currency?: string;
}

/** One search result, as Homzmart's search page embeds it (Magento fields; the ones we read). */
export interface HomzmartItem {
  id?: number;
  sku?: string;
  name?: string;
  url_key?: string;
  stock_status?: string;
  barcode_ean?: string | null;
  rating_summary?: number;
  review_count?: number;
  image?: { url?: string };
  price_range?: { minimum_price?: { regular_price?: Money; final_price?: Money } };
}

const TIMEOUT_MS = 30_000;

export function homzmartSearchUrl(siteUrl: string, query: string): string {
  return `${siteUrl.replace(/\/$/, '')}/en/search?${new URLSearchParams({ search: query }).toString()}`;
}

/** The first page of results (24) from the page's `__NEXT_DATA__` (`initialData.products.items`). */
export function parseHomzmartSearchItems(html: string): HomzmartItem[] {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return [];
  try {
    const data = JSON.parse(match[1]) as {
      props?: { pageProps?: { initialData?: { products?: { items?: unknown } } } };
    };
    const items = data.props?.pageProps?.initialData?.products?.items;
    return Array.isArray(items) ? (items as HomzmartItem[]) : [];
  } catch {
    return [];
  }
}

function money(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function mapHomzmartItem(item: HomzmartItem, siteUrl: string): RetailerListing {
  const prices = item.price_range?.minimum_price;
  const price = money(prices?.final_price?.value);
  const regular = money(prices?.regular_price?.value);
  const ean = item.barcode_ean?.trim() || null;
  return {
    externalId: item.sku ?? (item.id != null ? String(item.id) : ''),
    externalUrl: `${siteUrl.replace(/\/$/, '')}/en/p/${item.url_key ?? ''}`,
    title: (item.name ?? '').trim(),
    priceUsd: price,
    advertisedPrice: price != null && regular != null && regular > price ? regular : null,
    currency: prices?.final_price?.currency?.trim() || 'EGP',
    brand: null,
    model: null,
    imageUrl: item.image?.url || null,
    inStock: item.stock_status == null ? null : item.stock_status === 'IN_STOCK',
    // rating_summary is a 0-100 percentage; convert to a 0-5 scale
    rating: item.rating_summary && item.rating_summary > 0 ? (item.rating_summary / 100) * 5 : null,
    reviewCount: item.review_count && item.review_count > 0 ? item.review_count : null,
    identifiers: { gtin: ean, upc: null, ean, mpn: null },
    raw: { id: item.id, sku: item.sku, urlKey: item.url_key },
  };
}

/**
 * Homzmart (homzmart.com), an Egyptian furniture, home and appliances
 * marketplace. Plain HTTP: its Next.js search page (`/en/search?search=`)
 * carries the first page of results from its Magento backend.
 */
@Injectable()
export class HomzmartConnector implements RetailerConnector {
  readonly slug = 'homzmart';

  constructor(private readonly configService: ConfigService) {}

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.homzmartEnabled', true);
  }

  private get siteUrl(): string {
    return this.configService.get<string>('retailers.homzmartBaseUrl', 'https://homzmart.com');
  }

  async searchListings(query: string, limit: number): Promise<RetailerListing[]> {
    const response = await axios.get<string>(homzmartSearchUrl(this.siteUrl, query), {
      timeout: TIMEOUT_MS,
      responseType: 'text',
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      },
    });
    return parseHomzmartSearchItems(response.data)
      .map((item) => mapHomzmartItem(item, this.siteUrl))
      .filter((listing) => listing.title.length > 0 && listing.externalId.length > 0)
      .slice(0, Math.max(1, limit));
  }
}
