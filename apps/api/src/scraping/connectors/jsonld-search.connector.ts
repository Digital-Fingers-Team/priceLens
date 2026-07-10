import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RetailerListing } from '../interfaces/retailer-listing.interface';
import { parseJsonLdListings } from '../utils/jsonld-listing-parser';

export abstract class JsonLdSearchConnector {
  protected readonly logger = new Logger(this.constructor.name);

  abstract readonly slug: string;
  abstract readonly isEnabled: boolean;
  protected abstract readonly defaultCurrency: string;
  protected abstract buildSearchUrl(query: string): string;

  constructor(protected readonly configService: ConfigService) {}

  async searchListings(query: string, limit: number): Promise<RetailerListing[]> {
    if (!this.isEnabled) return [];

    const trimmed = query.trim();
    if (!trimmed) return [];

    const url = this.buildSearchUrl(trimmed);
    try {
      const html = await this.fetchHtml(url);
      return parseJsonLdListings(html, url, this.defaultCurrency, this.slug, limit);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Search failed for "${query}" (${this.slug}): ${message}`);
      return [];
    }
  }

  private async fetchHtml(url: string): Promise<string> {
    const headers = {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    };

    const response = await axios.get<string>(url, { timeout: 30000, headers });
    return response.data;
  }
}
