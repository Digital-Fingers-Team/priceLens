import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrowserSessionService } from '../browser/browser-session.service';
import { RetailerConnector } from '../interfaces/retailer-connector.interface';
import { RetailerListing } from '../interfaces/retailer-listing.interface';

interface RawAliExpressCard {
  href: string;
  title: string | null;
  priceLabel: string | null;
  imageUrl: string | null;
}

/**
 * AliExpress and its parent Alibaba both sit behind the same AWSC anti-bot
 * risk engine — plain HTTP and even a stealth-patched headless Chromium get
 * an explicit "slide to verify" CAPTCHA. Alibaba still shows that CAPTCHA
 * with a real installed Chrome + persistent profile, but AliExpress does
 * not — confirmed by reading the rendered page text, not just the HTTP
 * status. Same BrowserSessionService approach as Noon.
 */
@Injectable()
export class AliExpressConnector implements RetailerConnector {
  readonly slug = 'aliexpress';
  private readonly logger = new Logger(AliExpressConnector.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly browserSession: BrowserSessionService,
  ) {}

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.aliexpressEnabled', true);
  }

  async searchListings(query: string, limit: number): Promise<RetailerListing[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const baseUrl = this.configService.get<string>('retailers.aliexpressBaseUrl', 'https://www.aliexpress.com');
    const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const url = `${baseUrl.replace(/\/$/, '')}/w/wholesale-${encodeURIComponent(slug || trimmed)}.html`;

    const page = await this.browserSession.getPage(this.slug);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('a.search-card-item', { timeout: 15000 }).catch(() => undefined);
      await page.waitForTimeout(3000);

      const cards = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a.search-card-item'));
        const seen = new Set<string>();
        const out: RawAliExpressCard[] = [];
        for (const anchor of anchors) {
          const rawHref = (anchor as HTMLAnchorElement).getAttribute('href') ?? '';
          const href = rawHref.startsWith('//') ? `https:${rawHref}` : rawHref;
          if (!href || seen.has(href)) continue;
          seen.add(href);

          const titleEl = anchor.querySelector('h3');
          const img = anchor.querySelector('img.product-img');
          const priceEl = Array.from(anchor.querySelectorAll<HTMLElement>('[aria-label]')).find((el) =>
            /^[A-Za-z]{2,4}[\d,]+(\.\d+)?$/.test(el.getAttribute('aria-label') ?? ''),
          );
          const rawImg = img?.getAttribute('src') ?? null;

          out.push({
            href,
            title: titleEl?.textContent?.trim() ?? null,
            priceLabel: priceEl?.getAttribute('aria-label') ?? null,
            imageUrl: rawImg?.startsWith('//') ? `https:${rawImg}` : rawImg,
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

  private mapCard(card: RawAliExpressCard): RetailerListing | null {
    const externalId = this.extractProductId(card.href);
    const { amount, currency } = this.parsePriceLabel(card.priceLabel);

    if (!externalId || !card.title) return null;

    return {
      externalId,
      externalUrl: card.href,
      title: card.title,
      priceUsd: amount,
      currency: currency ?? 'USD',
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
    const match = href.match(/\/item\/(\d+)\.html/);
    return match ? match[1] : null;
  }

  private parsePriceLabel(label: string | null): { amount: number | null; currency: string | null } {
    if (!label) return { amount: null, currency: null };
    const match = label.match(/^([A-Za-z]{2,4})([\d,]+(?:\.\d+)?)$/);
    if (!match) return { amount: null, currency: null };
    const value = parseFloat(match[2].replace(/,/g, ''));
    return {
      amount: Number.isFinite(value) ? value : null,
      currency: match[1].toUpperCase(),
    };
  }
}
