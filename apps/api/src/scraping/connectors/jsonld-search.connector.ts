import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RetailerListing } from '../interfaces/retailer-listing.interface';
import { parseJsonLdListings } from '../utils/jsonld-listing-parser';
import { BrowserSessionService } from '../browser/browser-session.service';
import { isBotWallRefusal, openThroughBotWall } from '../browser/bot-wall';

export abstract class JsonLdSearchConnector {
  protected readonly logger = new Logger(this.constructor.name);

  abstract readonly slug: string;
  abstract readonly isEnabled: boolean;
  protected abstract readonly defaultCurrency: string;
  protected abstract buildSearchUrl(query: string): string;

  constructor(
    protected readonly configService: ConfigService,
    /** Enables the browser fallback for stores behind a bot wall (see fetchPage). */
    protected readonly browserSession?: BrowserSessionService,
  ) {}

  async searchListings(query: string, limit: number): Promise<RetailerListing[]> {
    if (!this.isEnabled) return [];

    const trimmed = query.trim();
    if (!trimmed) return [];

    const url = this.buildSearchUrl(trimmed);
    try {
      const html = await this.fetchPage(url);
      return parseJsonLdListings(html, url, this.defaultCurrency, this.slug, limit);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Search failed for "${query}" (${this.slug}): ${message}`);
      return [];
    }
  }

  /**
   * Plain HTTP first; on a bot-wall refusal (Jumia's Cloudflare challenge
   * answers every non-browser request with 403) the page is rendered in the
   * store's real browser profile instead, which can pass the challenge.
   */
  private async fetchPage(url: string): Promise<string> {
    try {
      return await this.fetchHtml(url);
    } catch (error) {
      if (!this.browserSession || !isBotWallRefusal(error)) throw error;
      const page = await this.browserSession.getPage(this.slug);
      try {
        await openThroughBotWall(page, url);
        return await page.content();
      } finally {
        await page.close().catch(() => undefined);
      }
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
