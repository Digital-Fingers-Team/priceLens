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
    const url = `${baseUrl.replace(/\/$/, '')}/egypt-en/search?q=${encodeURIComponent(trimmed)}`;

    const page = await this.browserSession.getPage(this.slug);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('[class*="sellingPrice"]', { timeout: 15000 }).catch(() => undefined);
      // Card titles hydrate in per-card, not all at once -- confirmed live that
      // a fixed sleep (tried up to 9s) still sometimes catches every single
      // card mid-hydration, with its <img alt> still the literal placeholder
      // string "placeholder". Poll instead of guessing a duration: wait until
      // real titles have actually landed on enough cards, capped at 15s so a
      // stuck straggler can't hang the whole search (whatever hasn't hydrated
      // by then is filtered out downstream anyway, same as a missing title).
      await page
        .waitForFunction(
          () => {
            const anchors = Array.from(document.querySelectorAll('a[class*="productBoxLink"]'));
            if (anchors.length === 0) return false;
            const hydrated = anchors.filter((anchor) => {
              const alt = anchor.querySelector('img')?.getAttribute('alt');
              return !!alt && alt.trim().toLowerCase() !== 'placeholder';
            });
            return hydrated.length >= Math.min(anchors.length, 5);
          },
          { timeout: 15000 },
        )
        .catch(() => undefined);

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
      // Close only this call's tab -- the browser context is shared and reused
      // by concurrent searches for this store (see BrowserSessionService);
      // closeStore() here would tear down the whole context mid-use by any
      // other in-flight call for the same store.
      await page.close().catch(() => undefined);
    }
  }

  private mapCard(card: RawNoonCard): RetailerListing | null {
    const externalId = this.extractProductId(card.href);
    const title = card.title?.replace(/\s*-\s*Image\s*\d+$/i, '').trim();
    const price = this.parsePrice(card.price);

    // Straggler cards that never finished hydrating within the poll's timeout
    // still carry the literal placeholder alt text -- drop them rather than
    // storing "placeholder" as a fake product title.
    if (!externalId || !title || title.toLowerCase() === 'placeholder') return null;

    return {
      externalId,
      externalUrl: card.href,
      title,
      priceUsd: price,
      currency: 'EGP',
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
