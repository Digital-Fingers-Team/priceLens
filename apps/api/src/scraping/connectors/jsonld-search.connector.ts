import { Logger } from '@nestjs/common';
import axios from 'axios';
import { RetailerListing } from '../interfaces/retailer-listing.interface';

export abstract class JsonLdSearchConnector {
  protected readonly logger = new Logger(this.constructor.name);

  abstract readonly slug: string;
  abstract readonly isEnabled: boolean;
  protected abstract readonly defaultCurrency: string;
  protected abstract buildSearchUrl(query: string): string;

  async searchListings(query: string, limit: number): Promise<RetailerListing[]> {
    if (!this.isEnabled) return [];

    const trimmed = query.trim();
    if (!trimmed) return [];

    const url = this.buildSearchUrl(trimmed);
    try {
      const response = await axios.get<string>(url, {
        timeout: 30000,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      });

      const items = this.extractProductNodes(response.data);
      const seen = new Set<string>();
      const out: RetailerListing[] = [];

      for (const node of items) {
        const mapped = this.mapProductNode(node, url);
        if (!mapped) continue;
        if (seen.has(mapped.externalId)) continue;
        seen.add(mapped.externalId);
        out.push(mapped);
        if (out.length >= Math.max(1, limit)) break;
      }

      return out;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Search failed for "${query}" (${this.slug}): ${message}`);
      return [];
    }
  }

  private extractProductNodes(html: string): Record<string, unknown>[] {
    const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    const candidates: Record<string, unknown>[] = [];
    let match: RegExpExecArray | null;

    while ((match = scriptRegex.exec(html)) !== null) {
      const rawJson = match[1]?.trim();
      if (!rawJson) continue;

      try {
        const parsed: unknown = JSON.parse(rawJson);
        this.collectProducts(parsed, candidates);
      } catch {
        continue;
      }
    }

    return candidates;
  }

  private collectProducts(node: unknown, out: Record<string, unknown>[]) {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      for (const item of node) this.collectProducts(item, out);
      return;
    }

    const record = node as Record<string, unknown>;
    const type = this.normalizeType(record['@type']);
    if (type === 'product') {
      out.push(record);
    }

    if (Array.isArray(record['@graph'])) {
      this.collectProducts(record['@graph'], out);
    }

    if (Array.isArray(record.itemListElement)) {
      for (const item of record.itemListElement) {
        if (!item || typeof item !== 'object') continue;
        const listItem = item as Record<string, unknown>;
        this.collectProducts(listItem.item ?? listItem, out);
      }
    }
  }

  private mapProductNode(node: Record<string, unknown>, fallbackUrl: string): RetailerListing | null {
    const title = this.asString(node.name);
    if (!title) return null;

    const url = this.asString(node.url) ?? fallbackUrl;
    const externalId =
      this.asString(node.sku) ??
      this.asString(node.productID) ??
      this.asString(node.mpn) ??
      this.asString(node.gtin13) ??
      this.asString(node.gtin12) ??
      this.makeSyntheticId(url, title);

    const offer = this.resolvePrimaryOffer(node.offers);
    const availability = this.asString(offer?.availability);
    const aggregateRating = this.asObject(node.aggregateRating);
    const brand = this.extractBrand(node.brand);

    return {
      externalId,
      externalUrl: url,
      title,
      priceUsd: this.asNumber(offer?.price ?? offer?.lowPrice ?? offer?.highPrice),
      currency: this.asString(offer?.priceCurrency) ?? this.defaultCurrency,
      brand,
      model: this.asString(node.model),
      imageUrl: this.extractImage(node.image),
      inStock:
        availability == null
          ? null
          : availability.toLowerCase().includes('instock') ||
            availability.toLowerCase().includes('in_stock'),
      rating: this.asNumber(aggregateRating?.ratingValue),
      reviewCount: this.asInt(aggregateRating?.reviewCount ?? aggregateRating?.ratingCount),
      identifiers: {
        gtin: this.asString(node.gtin13),
        upc: this.asString(node.gtin12),
        ean: this.asString(node.gtin14) ?? this.asString(node.gtin8),
        mpn: this.asString(node.mpn),
      },
      raw: node,
    };
  }

  private resolvePrimaryOffer(offers: unknown): Record<string, unknown> | null {
    if (!offers) return null;
    if (Array.isArray(offers)) {
      for (const offer of offers) {
        const parsed = this.asObject(offer);
        if (parsed) return parsed;
      }
      return null;
    }
    return this.asObject(offers);
  }

  private extractBrand(brand: unknown): string | null {
    if (typeof brand === 'string') return this.asString(brand);
    const record = this.asObject(brand);
    if (!record) return null;
    return this.asString(record.name) ?? this.asString(record['@id']);
  }

  private extractImage(image: unknown): string | null {
    if (typeof image === 'string') return this.asString(image);
    if (Array.isArray(image)) {
      for (const item of image) {
        const value = this.extractImage(item);
        if (value) return value;
      }
      return null;
    }
    const record = this.asObject(image);
    if (!record) return null;
    return this.asString(record.url) ?? this.asString(record.contentUrl);
  }

  private normalizeType(type: unknown): string | null {
    if (typeof type === 'string') return type.trim().toLowerCase();
    if (Array.isArray(type)) {
      for (const item of type) {
        if (typeof item === 'string' && item.trim()) {
          return item.trim().toLowerCase();
        }
      }
    }
    return null;
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }

  private asString(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return null;
  }

  private asNumber(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(/[, ]+/g, ''));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private asInt(value: unknown): number | null {
    const numeric = this.asNumber(value);
    return numeric == null ? null : Math.trunc(numeric);
  }

  private makeSyntheticId(url: string, title: string): string {
    const source = `${this.slug}:${url}:${title}`.toLowerCase();
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return `${this.slug}-${(hash >>> 0).toString(16)}`;
  }
}

