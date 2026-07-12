import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrowserSessionService } from '../browser/browser-session.service';
import { RetailerConnector } from '../interfaces/retailer-connector.interface';
import { RetailerListing } from '../interfaces/retailer-listing.interface';

interface RawAlibabaCard {
  href: string;
  title: string | null;
  priceLabel: string | null;
  imageUrl: string | null;
}

/**
 * Alibaba's AWSC risk engine serves an explicit "slide to verify" CAPTCHA to
 * automated clients — even a real installed Chrome + persistent profile hits
 * it on a brand-new profile. Once a human solves it manually one time (see
 * `npm run login:alibaba`), the profile's session cookie stays trusted for
 * subsequent automated visits — no per-request solving needed. Same
 * BrowserSessionService as Noon/AliExpress. Alibaba is B2B/wholesale, so
 * prices are often MOQ-tier ranges (e.g. "EGP 10,135.67-10,957.48") — this
 * takes the lower bound of the range as priceUsd.
 */
@Injectable()
export class AlibabaConnector implements RetailerConnector {
  readonly slug = 'alibaba';
  private readonly logger = new Logger(AlibabaConnector.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly browserSession: BrowserSessionService,
  ) {}

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.alibabaEnabled', true);
  }

  async searchListings(query: string, limit: number): Promise<RetailerListing[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const baseUrl = this.configService.get<string>('retailers.alibabaBaseUrl', 'https://www.alibaba.com');
    const url = `${baseUrl.replace(/\/$/, '')}/trade/search?SearchText=${encodeURIComponent(trimmed)}`;

    const page = await this.browserSession.getPage(this.slug);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('.searchx-offer-item', { timeout: 15000 }).catch(() => undefined);
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(3000);

      const stillBlocked = await page.evaluate(
        () => !!document.querySelector('#nc_1_wrapper, .nc_wrapper'),
      );
      if (stillBlocked) {
        this.logger.warn(
          `Alibaba is showing the CAPTCHA again for "${query}" — run "npm run login:alibaba" to re-solve it manually.`,
        );
        return [];
      }

      const cards = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.searchx-offer-item'));
        const seen = new Set<string>();
        const out: RawAlibabaCard[] = [];
        for (const item of items) {
          const link = item.querySelector<HTMLAnchorElement>('h2.searchx-product-e-title a');
          const rawHref = link?.getAttribute('href') ?? '';
          const href = rawHref.startsWith('//') ? `https:${rawHref}` : rawHref;
          if (!href || seen.has(href)) continue;
          seen.add(href);

          const priceEl = item.querySelector('.searchx-product-price-price-main');
          const img = item.querySelector('img');
          const rawImg = img?.getAttribute('src') ?? null;

          out.push({
            href,
            title: link?.textContent?.trim() ?? null,
            priceLabel: priceEl?.textContent?.trim() ?? null,
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
      await this.browserSession.closeStore(this.slug);
    }
  }

  private mapCard(card: RawAlibabaCard): RetailerListing | null {
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
    const match = href.match(/_(\d+)\.html/);
    return match ? match[1] : null;
  }

  private parsePriceLabel(label: string | null): { amount: number | null; currency: string | null } {
    if (!label) return { amount: null, currency: null };
    // Ranges like "EGP 10,135.67-10,957.48" — take the lower (first) bound.
    const match = label.match(/^([A-Za-z]{2,4})\s*([\d,]+(?:\.\d+)?)/);
    if (!match) return { amount: null, currency: null };
    const value = parseFloat(match[2].replace(/,/g, ''));
    return {
      amount: Number.isFinite(value) ? value : null,
      currency: match[1].toUpperCase(),
    };
  }
}
