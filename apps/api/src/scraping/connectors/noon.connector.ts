import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrowserSessionService } from '../browser/browser-session.service';
import { RetailerConnector } from '../interfaces/retailer-connector.interface';
import { RetailerListing } from '../interfaces/retailer-listing.interface';

interface RawNoonCard {
  href: string;
  price: string | null;
  title: string | null;
  imageUrl: string | null;
}

/**
 * Noon sits behind Akamai Bot Manager — plain HTTP requests (see
 * jsonld-search.connector.ts) get back a 53-byte cached bot-shell page, and
 * even a stealth-patched headless Chromium gets its connection reset at the
 * HTTP/2 layer. The only approach that got real product data through was a
 * real installed Chrome binary with a persistent, previously-logged-in
 * profile, driven non-headless. See BrowserSessionService.
 */
@Injectable()
export class NoonConnector implements RetailerConnector {
  readonly slug = 'noon';
  private readonly logger = new Logger(NoonConnector.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly browserSession: BrowserSessionService,
  ) {}

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.noonEnabled', true);
  }

  async searchListings(query: string, limit: number): Promise<RetailerListing[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const baseUrl = this.configService.get<string>('retailers.noonBaseUrl', 'https://www.noon.com');
    const url = `${baseUrl.replace(/\/$/, '')}/uae-en/search?q=${encodeURIComponent(trimmed)}`;

    const page = await this.browserSession.getPage(this.slug);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('[class*="sellingPrice"]', { timeout: 15000 }).catch(() => undefined);
      // Product images/titles lazy-load slightly after the price does; give
      // them a moment too so cards don't come back as "placeholder".
      await page.waitForTimeout(4000);

      const cards = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[class*="productBoxLink"]'));
        const seen = new Set<string>();
        const out: RawNoonCard[] = [];
        for (const anchor of anchors) {
          const href = (anchor as HTMLAnchorElement).href;
          if (!href || seen.has(href)) continue;
          seen.add(href);

          const priceEl = anchor.querySelector('[class*="sellingPrice"]');
          const img = anchor.querySelector('img');
          out.push({
            href,
            price: priceEl ? priceEl.textContent?.trim() ?? null : null,
            title: img?.getAttribute('alt') ?? null,
            imageUrl: img?.getAttribute('src') ?? null,
          });
        }
        return out;
      });

      return cards
        .slice(0, limit)
        .map((card) => this.mapCard(card))
        .filter((listing): listing is RetailerListing => listing !== null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Search failed for "${query}" (${this.slug}): ${message}`);
      return [];
    } finally {
      await this.browserSession.closeStore(this.slug);
    }
  }

  private mapCard(card: RawNoonCard): RetailerListing | null {
    const externalId = this.extractProductId(card.href);
    const title = card.title?.replace(/\s*-\s*Image\s*\d+$/i, '').trim();
    const price = this.parsePrice(card.price);

    if (!externalId || !title) return null;

    return {
      externalId,
      externalUrl: card.href,
      title,
      priceUsd: price,
      currency: 'AED',
      brand: null,
      model: null,
      imageUrl: card.imageUrl,
      inStock: null,
      rating: null,
      reviewCount: null,
      identifiers: { gtin: null, upc: null, ean: null, mpn: null },
      raw: card as unknown as Record<string, unknown>,
    };
  }

  private extractProductId(href: string): string | null {
    const match = href.match(/\/([A-Za-z0-9]+)\/p\//);
    return match ? match[1] : null;
  }

  private parsePrice(text: string | null): number | null {
    if (!text) return null;
    const cleaned = text.replace(/,/g, '').match(/\d+(\.\d+)?/);
    if (!cleaned) return null;
    const value = parseFloat(cleaned[0]);
    return Number.isFinite(value) ? value : null;
  }
}
