import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RedisCacheService } from '../common/cache/redis-cache.service';
import { PriceDrop, PriceDropsService } from './price-drops.service';

/** How many drops one post lists. */
const POST_SIZE = 8;
/** A product posted in the last week is not posted again. */
const POSTED_KEY = 'deals:telegram-posted:v1';
const POSTED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function egp(value: number): string {
  return `${value.toLocaleString('en-US')} ج.م`;
}

/** A title short enough for a phone screen. */
function shortTitle(title: string): string {
  return title.length > 70 ? `${title.slice(0, 67).trimEnd()}…` : title;
}

/**
 * The daily "price drops" post to a public Telegram channel: the biggest real
 * drops (PriceDropsService) not posted in the last week, each linking to its
 * product page on the site (not straight to the store: the page shows every
 * store's price, and brings the visit to us).
 *
 * Off until DEALS_TELEGRAM_CHAT is set (the channel's @name or numeric id;
 * the bot must be a channel admin). The bot is DEALS_TELEGRAM_BOT_TOKEN, or the
 * owner's alert bot when that is empty.
 */
@Injectable()
export class DealsPostService {
  private readonly logger = new Logger(DealsPostService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly drops: PriceDropsService,
    private readonly cache: RedisCacheService,
  ) {}

  async postDaily(): Promise<{ posted: number } | { skipped: string }> {
    const chatId = this.config.get<string>('notifications.dealsTelegramChat', '');
    const token =
      this.config.get<string>('notifications.dealsTelegramBotToken', '') ||
      this.config.get<string>('billing.ownerTelegramBotToken', '');
    if (!chatId || !token) return { skipped: 'DEALS_TELEGRAM_CHAT or bot token not set' };

    const posted = new Set((await this.cache.get<string[]>(POSTED_KEY).catch(() => null)) ?? []);
    const { drops } = await this.drops.all();
    const picks = pickForPost(drops, posted, POST_SIZE);
    if (picks.length === 0) return { skipped: 'no new drops' };

    const site = this.config.get<string>('app.frontendUrl', 'https://pricelens.store').replace(/\/$/, '');
    const base = this.config.get<string>('notifications.telegramApiBase', 'https://api.telegram.org');
    await axios.post(
      `${base}/bot${token}/sendMessage`,
      {
        chat_id: chatId,
        text: buildPostText(picks, site),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [[{ text: 'كل التخفيضات', url: `${site}/price-drops` }]] },
      },
      { timeout: 10_000 },
    );

    for (const drop of picks) posted.add(drop.productId);
    await this.cache.set(POSTED_KEY, [...posted].slice(-500), POSTED_TTL_MS).catch(() => undefined);
    this.logger.log(`Posted ${picks.length} price drops to ${chatId}`);
    return { posted: picks.length };
  }
}

/**
 * The biggest drops not posted lately, at most two per category so one
 * category's sale does not fill the post.
 */
export function pickForPost(drops: PriceDrop[], posted: ReadonlySet<string>, size: number): PriceDrop[] {
  const perCategory = new Map<string, number>();
  const picks: PriceDrop[] = [];
  for (const drop of drops) {
    if (picks.length >= size) break;
    if (posted.has(drop.productId)) continue;
    const used = perCategory.get(drop.categorySlug) ?? 0;
    if (used >= 2) continue;
    perCategory.set(drop.categorySlug, used + 1);
    picks.push(drop);
  }
  return picks;
}

export function buildPostText(picks: PriceDrop[], site: string): string {
  const lines = picks.map((d) => {
    const title = escapeHtml(shortTitle(d.titleAr ?? d.title));
    return [
      `🔻 <b>${d.dropPct}%</b> · <a href="${site}/products/${encodeURIComponent(d.slug)}">${title}</a>`,
      `${egp(d.price)} بدل ${egp(d.usualPrice)} · ${escapeHtml(d.store)}`,
    ].join('\n');
  });
  return [`<b>تخفيضات النهارده</b> 📉`, 'أسعار نزلت عن متوسطها في آخر 30 يوم:', '', lines.join('\n\n')].join('\n');
}
