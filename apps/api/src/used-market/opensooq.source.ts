import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import type { ClassifiedListing } from './used-market';

const TIMEOUT_MS = 20_000;

/**
 * OpenSooq Egypt's search page carries its results as Next.js page data.
 * Plain HTTP. Only each listing's title and asking price are read; names,
 * phone numbers, locations and photos are never touched or stored.
 */
@Injectable()
export class OpenSooqSource {
  readonly id = 'opensooq';
  private readonly logger = new Logger(OpenSooqSource.name);

  searchUrl(query: string): string {
    return `https://eg.opensooq.com/en/find?term=${encodeURIComponent(query)}`;
  }

  async search(query: string): Promise<ClassifiedListing[]> {
    const { data } = await axios.get<string>(this.searchUrl(query), {
      timeout: TIMEOUT_MS,
      responseType: 'text',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept-Language': 'en',
      },
    });
    return parseOpenSooq(data);
  }
}

export function parseOpenSooq(html: string): ClassifiedListing[] {
  const match = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) return [];
  let items: Array<{ title?: unknown; price_amount?: unknown; price_currency_iso?: unknown }> = [];
  try {
    items = JSON.parse(match[1])?.props?.pageProps?.serpApiResponse?.listings?.items ?? [];
  } catch {
    return [];
  }
  return items
    .filter((item) => String(item.price_currency_iso ?? 'EGP').toUpperCase().startsWith('EGP'))
    .map((item) => ({
      title: String(item.title ?? ''),
      price: Number(String(item.price_amount ?? '').replace(/[^\d.]/g, '')),
    }))
    .filter((item) => item.title && item.price > 0);
}
