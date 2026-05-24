import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RetailerConnector } from './interfaces/retailer-connector.interface';
import { RetailerListing } from './interfaces/retailer-listing.interface';

@Injectable()
export class BestBuyConnector implements RetailerConnector {
  private readonly logger = new Logger(BestBuyConnector.name);
  readonly slug = 'bestbuy';
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = configService.get<string>('retailers.bestBuyApiKey', '');
    this.baseUrl = configService.get<string>('retailers.bestBuyApiUrl', 'https://api.bestbuy.com/v1');
  }

  get isEnabled(): boolean {
    return this.apiKey.trim().length > 0;
  }

  async searchListings(query: string, limit = 25): Promise<RetailerListing[]> {
    if (!this.isEnabled) {
      throw new Error('BESTBUY_API_KEY is not configured');
    }

    const terms = query
      .trim()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);

    if (terms.length === 0) {
      return [];
    }

    const filters = terms.map((term) => `search=${term}`).join('&');
    const url = `${this.baseUrl.replace(/\/$/, '')}/products(${filters})`;

    const response = await axios.get(url, {
      params: {
        format: 'json',
        pageSize: limit,
        show: [
          'sku',
          'name',
          'salePrice',
          'regularPrice',
          'manufacturer',
          'modelNumber',
          'upc',
          'gtin',
          'ean',
          'image',
          'thumbnailImage',
          'url',
          'onlineAvailability',
          'customerReviewAverage',
          'customerReviewCount',
          'shortDescription',
          'longDescription',
          'categoryPath',
        ].join(','),
        apiKey: this.apiKey,
      },
      timeout: 30000,
      validateStatus: (status) => status >= 200 && status < 500,
    });

    if (response.status >= 400) {
      this.logger.warn(`Best Buy search failed for "${query}" with status ${response.status}`);
      return [];
    }

    const products = Array.isArray(response.data?.products)
      ? response.data.products
      : Array.isArray(response.data)
        ? response.data
        : [];

    return products
      .map((raw: Record<string, unknown>) => this.mapListing(raw))
      .filter((listing: RetailerListing | null): listing is RetailerListing => listing != null);
  }

  private mapListing(raw: Record<string, unknown>): RetailerListing | null {
    const externalId = this.asString(raw.sku ?? raw.productId ?? raw.id);
    const title = this.asString(raw.name ?? raw.title);

    if (!externalId || !title) {
      return null;
    }

    let priceUsd = this.asNumber(raw.salePrice ?? raw.currentPrice ?? raw.price);
    if (priceUsd == null && raw.prices && typeof raw.prices === 'object') {
      priceUsd = this.asNumber((raw.prices as Record<string, unknown>).current);
    }
    const regularPrice = this.asNumber(raw.regularPrice ?? raw.msrp ?? raw.listPrice);
    const imageUrl = this.pickString(raw, [
      ['image'],
      ['thumbnailImage'],
      ['images', 'standard'],
      ['images', 'medium'],
      ['images', 'large'],
    ]);
    const externalUrl = this.pickString(raw, [
      ['url'],
      ['links', 'web'],
      ['links', 'product'],
    ]) ?? `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(title)}`;
    const brand = this.asString(raw.manufacturer ?? raw.brand);
    const model = this.asString(raw.modelNumber ?? raw.model);
    const inStock = this.asBoolean(raw.onlineAvailability ?? raw.inStock ?? raw.orderable);
    const rating = this.asNumber(raw.customerReviewAverage ?? raw.rating);
    const reviewCount = this.asNumber(raw.customerReviewCount ?? raw.reviewCount);
    const gtin = this.asString(raw.gtin);
    const upc = this.asString(raw.upc);
    const ean = this.asString(raw.ean);
    const mpn = this.asString(raw.modelNumber ?? raw.mpn);

    return {
      externalId,
      externalUrl,
      title,
      priceUsd: priceUsd ?? regularPrice ?? null,
      currency: 'USD',
      brand,
      model,
      imageUrl,
      inStock,
      rating,
      reviewCount,
      identifiers: {
        gtin,
        upc,
        ean,
        mpn,
      },
      raw,
    };
  }

  private asString(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return null;
  }

  private asNumber(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private asBoolean(value: unknown): boolean | null {
    if (value == null) return null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', 'yes', '1', 'in stock', 'available'].includes(normalized)) return true;
      if (['false', 'no', '0', 'out of stock', 'unavailable'].includes(normalized)) return false;
    }
    return null;
  }

  private pickString(raw: Record<string, unknown>, path: string[][]): string | null {
    for (const keys of path) {
      let current: unknown = raw;
      for (const key of keys) {
        if (current == null || typeof current !== 'object') {
          current = null;
          break;
        }
        current = (current as Record<string, unknown>)[key];
      }

      const value = this.asString(current);
      if (value) return value;
    }

    return null;
  }
}
