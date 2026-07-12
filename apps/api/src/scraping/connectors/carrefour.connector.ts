import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrowserSessionService } from '../browser/browser-session.service';
import { RetailerConnector } from '../interfaces/retailer-connector.interface';
import { RetailerListing } from '../interfaces/retailer-listing.interface';

interface RawCarrefourCard {
  href: string;
  imageUrl: string | null;
  cardText: string;
}

/**
 * Carrefour UAE isn't behind a hard anti-bot wall at all — the earlier
 * plain-HTTP connector failed only because (a) the site is a JS-rendered
 * Next.js storefront with nothing server-rendered for a non-browser
 * request, and (b) its search query param changed from `?text=` to
 * `?keyword=` since this connector was first written. A real Chrome +
 * persistent profile with the corrected URL works on the first visit, no
 * login/CAPTCHA/warm-up needed. The product card markup has no semantic
 * class names (Tailwind-only), so title/price are pulled from the card's
 * plain innerText via regex rather than fragile nested selectors.
 */
@Injectable()
export class CarrefourConnector implements RetailerConnector {
  readonly slug = 'carrefour';
  private readonly logger = new Logger(CarrefourConnector.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly browserSession: BrowserSessionService,
  ) {}

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.carrefourEnabled', true);
  }

  async searchListings(query: string, limit: number): Promise<RetailerListing[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const baseUrl = this.configService.get<string>('retailers.carrefourBaseUrl', 'https://www.carrefouruae.com');
    const url = `${baseUrl.replace(/\/$/, '')}/mafuae/en/search?keyword=${encodeURIComponent(trimmed)}`;

    const page = await this.browserSession.getPage(this.slug);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page
        .getByText('Continue', { exact: true })
        .click({ timeout: 4000 })
        .catch(() => undefined);
      await page.waitForSelector('a.w-full[href*="/p/"]', { timeout: 15000 }).catch(() => undefined);
      await page.waitForTimeout(4000);

      const cards = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a.w-full[href*="/p/"]'));
        const seen = new Set<string>();
        const out: RawCarrefourCard[] = [];
        for (const a of anchors) {
          const href = a.getAttribute('href') ?? '';
          if (!href || seen.has(href)) continue;
          seen.add(href);

          let ancestor: HTMLElement | null = a;
          let text = '';
          for (let i = 0; i < 10 && ancestor; i++) {
            text = ancestor.innerText || '';
            if (text.length > 30) break;
            ancestor = ancestor.parentElement;
          }

          const img = a.querySelector('img');
          out.push({ href, imageUrl: img?.getAttribute('src') ?? null, cardText: text });
        }
        return out;
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
      await this.browserSession.closeStore(this.slug);
    }
  }

  private mapCard(card: RawCarrefourCard, baseUrl: string): RetailerListing | null {
    const externalId = this.extractProductId(card.href);
    const { title, amount, currency } = this.parseCardText(card.cardText);

    if (!externalId || !title) return null;

    const externalUrl = card.href.startsWith('http') ? card.href : `${baseUrl.replace(/\/$/, '')}${card.href}`;

    return {
      externalId,
      externalUrl,
      title,
      priceUsd: amount,
      currency: currency ?? 'AED',
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
    const match = href.match(/\/p\/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Card text looks like: "[badge lines...]\nTitle\n3,599\n.00\nAED\n...".
   * The line right before the whole/decimal/currency triplet is the title.
   */
  private parseCardText(text: string): { title: string | null; amount: number | null; currency: string | null } {
    const match = text.match(/([^\n]+)\n([\d,]+)\n\.(\d{2})\n([A-Za-z]{2,4})\b/);
    if (!match) return { title: null, amount: null, currency: null };

    const value = parseFloat(`${match[2].replace(/,/g, '')}.${match[3]}`);
    return {
      title: match[1].trim(),
      amount: Number.isFinite(value) ? value : null,
      currency: match[4].toUpperCase(),
    };
  }
}
