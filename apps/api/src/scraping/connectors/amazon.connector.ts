import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrowserSessionService } from '../browser/browser-session.service';
import { RetailerConnector } from '../interfaces/retailer-connector.interface';
import { RetailerListing } from '../interfaces/retailer-listing.interface';

interface RawAmazonCard {
  asin: string | null;
  title: string | null;
  priceLabel: string | null;
  imageUrl: string | null;
  /** The struck-through "List:" price, when the card shows one. */
  listPriceLabel: string | null;
  /** Text Amazon uses to mark a card unavailable, when present. */
  unavailableLabel: string | null;
}

/**
 * Amazon's bot detection is intermittent under plain HTTP or a bundled
 * Chromium (503 "Sorry! Something went wrong!"). A real installed Chrome +
 * persistent profile gets through with no login or CAPTCHA-solving needed —
 * but the very first visit on a brand-new profile still gets the 503; only
 * later visits on that same (now not-brand-new) profile succeed. Run
 * `npm run login:amazon` once per profile to "warm it up" before relying on
 * this connector. Same BrowserSessionService as the other browser-driven
 * connectors. Some sponsored slots render without a price — those get
 * filtered out downstream (no usable price), which is expected.
 */
@Injectable()
export class AmazonConnector implements RetailerConnector {
  readonly slug = 'amazon';
  private readonly logger = new Logger(AmazonConnector.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly browserSession: BrowserSessionService,
  ) {}

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.amazonEnabled', true);
  }

  async searchListings(query: string, limit: number): Promise<RetailerListing[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const baseUrl = this.configService.get<string>('retailers.amazonBaseUrl', 'https://www.amazon.com');
    const url = `${baseUrl.replace(/\/$/, '')}/s?k=${encodeURIComponent(trimmed)}`;

    const page = await this.browserSession.getPage(this.slug);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('div[data-component-type="s-search-result"]', { timeout: 15000 }).catch(() => undefined);
      await page.waitForTimeout(2000);

      const cards = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('div[data-component-type="s-search-result"]'));
        return items.map((item): RawAmazonCard => {
          // Cards with a color/pattern swatch selector (very common for phones)
          // put only the bare brand name in `h2 span` ("OPPO") -- the real full
          // title lives in the product image's alt text instead, confirmed live
          // against amazon.eg. h2 text is kept only as a fallback for cards
          // without that swatch structure.
          const img = item.querySelector('img.s-image');
          const h2 = item.querySelector('h2');
          const title = img?.getAttribute('alt')?.trim() || h2?.textContent?.trim() || null;
          // The live price and the struck-through one are both .a-price, and
          // are told apart by a-text-price, which Amazon puts only on the
          // "List:" price. Selecting .a-price blindly would pick whichever
          // came first in the DOM and could report the was-price as the price.
          const priceEl = item.querySelector('.a-price:not(.a-text-price) .a-offscreen');
          const listPriceEl = item.querySelector('.a-price.a-text-price .a-offscreen');

          // Amazon marks unavailable results in the card body rather than with
          // a stable class, so match the wording. Kept narrow on purpose: a
          // phrase we do not recognise leaves stock unknown rather than
          // guessing "available".
          const bodyText = item.textContent?.toLowerCase() ?? '';
          const unavailablePhrase = [
            'currently unavailable',
            'temporarily out of stock',
            'out of stock',
          ].find((phrase) => bodyText.includes(phrase));

          return {
            asin: item.getAttribute('data-asin'),
            title,
            priceLabel: priceEl?.textContent?.trim() ?? null,
            listPriceLabel: listPriceEl?.textContent?.trim() ?? null,
            unavailableLabel: unavailablePhrase ?? null,
            imageUrl: img?.getAttribute('src') ?? null,
          };
        });
      });

      return cards
        .slice(0, limit)
        .map((card) => this.mapCard(card, baseUrl))
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

  private mapCard(card: RawAmazonCard, baseUrl: string): RetailerListing | null {
    const { amount, currency } = this.parsePriceLabel(card.priceLabel);

    if (!card.asin || !card.title) return null;

    const listPrice = this.parsePriceLabel(card.listPriceLabel).amount;

    return {
      externalId: card.asin,
      externalUrl: `${baseUrl.replace(/\/$/, '')}/dp/${card.asin}`,
      title: card.title,
      priceUsd: amount,
      // Only a genuinely higher struck-through price is a discount claim.
      advertisedPrice: listPrice != null && amount != null && listPrice > amount ? listPrice : null,
      currency: currency ?? 'EGP',
      brand: null,
      model: null,
      imageUrl: card.imageUrl,
      // Stock inferred from the search card, which is the only signal a search
      // scrape has: an explicit unavailability phrase means out of stock; a
      // buyable price with no such phrase means in stock. Anything else stays
      // null -- unknown, not "available" -- so downstream restock alerts and
      // the deal score's availability signal are never fed a guess.
      inStock: card.unavailableLabel ? false : amount != null ? true : null,
      rating: null,
      reviewCount: null,
      identifiers: { gtin: null, upc: null, ean: null, mpn: null },
      raw: card as unknown as Record<string, unknown>,
    };
  }

  private parsePriceLabel(label: string | null): { amount: number | null; currency: string | null } {
    if (!label) return { amount: null, currency: null };
    const match = label.match(/^([A-Za-z]{2,4})\s*([\d,]+(?:\.\d+)?)/);
    if (!match) return { amount: null, currency: null };
    const value = parseFloat(match[2].replace(/,/g, ''));
    return {
      amount: Number.isFinite(value) ? value : null,
      currency: match[1].toUpperCase(),
    };
  }
}
