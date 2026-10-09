import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RetailerConnector } from '../interfaces/retailer-connector.interface';
import { RetailerListing } from '../interfaces/retailer-listing.interface';
import { firstJsonArray, streamedText } from '../utils/next-flight';

/** One search result, as Sigma's search page embeds it (the fields we read). */
export interface SigmaItem {
  id?: string;
  slug?: string;
  name?: string;
  sku?: string;
  price?: { base?: number; current?: number; currency?: string };
  thumbnail?: { url?: string };
  brand?: { name?: string } | string | null;
  is_stock?: boolean;
}

const TIMEOUT_MS = 30_000;

export function sigmaSearchUrl(siteUrl: string, query: string): string {
  return `${siteUrl.replace(/\/$/, '')}/en/search?${new URLSearchParams({ q: query }).toString()}`;
}

/** The results Sigma's search page renders on its own servers (`"products":[...]`, 16 a page). */
export function parseSigmaSearchItems(html: string): SigmaItem[] {
  return firstJsonArray<SigmaItem>(streamedText(html), 'products');
}

function money(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * `current` is the price the product page shows and sells at. `base` is the
 * struck-through price only when it is higher; Sigma also leaves a stale,
 * lower `base` on repriced items, which is not a discount.
 */
export function mapSigmaItem(item: SigmaItem, siteUrl: string): RetailerListing {
  const price = money(item.price?.current);
  const base = money(item.price?.base);
  const brand = typeof item.brand === 'string' ? item.brand : item.brand?.name;
  return {
    externalId: item.id ?? item.slug ?? '',
    externalUrl: `${siteUrl.replace(/\/$/, '')}/en/item?${new URLSearchParams({ id: item.slug ?? '' }).toString()}`,
    title: (item.name ?? '').trim(),
    priceUsd: price,
    advertisedPrice: price != null && base != null && base > price ? base : null,
    currency: item.price?.currency?.trim() || 'EGP',
    brand: brand?.trim() || null,
    model: null,
    imageUrl: item.thumbnail?.url || null,
    inStock: typeof item.is_stock === 'boolean' ? item.is_stock : null,
    rating: null,
    reviewCount: null,
    identifiers: { gtin: null, upc: null, ean: null, mpn: item.sku?.trim() || null },
    raw: { id: item.id, slug: item.slug, sku: item.sku },
  };
}

/**
 * Sigma Computer (sigma-computer.com), a Cairo PC-parts and laptop store.
 * Plain HTTP: its store API wants a session, but the search page
 * (`/en/search?q=`) carries the first page of results as embedded data.
 */
@Injectable()
export class SigmaConnector implements RetailerConnector {
  readonly slug = 'sigma';

  constructor(private readonly configService: ConfigService) {}

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.sigmaEnabled', true);
  }

  private get siteUrl(): string {
    return this.configService.get<string>('retailers.sigmaBaseUrl', 'https://www.sigma-computer.com');
  }

  async searchListings(query: string, limit: number): Promise<RetailerListing[]> {
    const response = await axios.get<string>(sigmaSearchUrl(this.siteUrl, query), {
      timeout: TIMEOUT_MS,
      responseType: 'text',
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      },
    });
    return parseSigmaSearchItems(response.data)
      .map((item) => mapSigmaItem(item, this.siteUrl))
      .filter((listing) => listing.title.length > 0 && listing.externalId.length > 0)
      .slice(0, Math.max(1, limit));
  }
}
