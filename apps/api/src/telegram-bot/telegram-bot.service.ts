import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannelType } from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '../database/prisma.service';
import { RedisCacheService } from '../common/cache/redis-cache.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { FEATURES } from '../billing/plan-limits';
import { SearchService } from '../search/search.service';
import { BuyerExtrasService } from '../buyer/buyer-extras.service';
import { ImageSearchService } from '../image-search/image-search.service';
import { AppException } from '../common/errors/app.exception';
import { liveOfferWhere } from '../prices/offer-rules';
import { TelegramButton, cairoTime, escapeHtml, formatMoney, numberEmoji, shorten } from '../notifications/telegram-format';
import { randomBytes } from 'node:crypto';

/** The 8-character code the notifications page asks people to send the bot. */
export const VERIFY_CODE = /^[0-9A-F]{8}$/i;
export const VERIFY_KEY = (code: string) => `tg-verify:${code.toUpperCase()}`;

export interface TelegramUpdate {
  message?: {
    chat?: { id: number };
    text?: string;
    photo?: Array<{ file_id: string; file_size?: number }>;
    caption?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat?: { id: number } };
  };
}

/** What the bot sends: HTML text and rows of inline buttons. */
export interface BotMessage {
  text: string;
  buttons?: TelegramButton[][];
}

/** A bot reply, with the search it answered and a fingerprint of the prices shown. */
export type ShownMessage = BotMessage & { query?: string; prices?: string };

/** The refresh button stores its query here; callback data is limited to 64 bytes. */
export const QUERY_KEY = (id: string) => `tg-q:${id}`;
const QUERY_TTL_SECONDS = 24 * 60 * 60;
/** One automatic price check after the background store scrape has had time to land. */
const LIVE_FOLLOW_UP_MS = 30_000;

/** Free chats get a taste; a linked paid plan gets plenty and photos. */
const DAILY_LIMIT = { free: 10, paid: 100 };

/**
 * The Telegram bot: a link, a product name or a photo in; the cheapest
 * offers, the best installment plan and a link to the product page out.
 *
 * It also receives the codes people send to link their Telegram for alerts
 * (stored in Redis for TelegramChannel to find), which is what keeps
 * account linking working once the bot has a webhook.
 */
@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly entitlements: EntitlementsService,
    private readonly search: SearchService,
    private readonly extras: BuyerExtrasService,
    private readonly imageSearch: ImageSearchService,
    private readonly config: ConfigService,
  ) {}

  private get token(): string {
    return this.config.get<string>('notifications.telegramBotToken', '');
  }

  private get api(): string {
    return `${this.config.get<string>('notifications.telegramApiBase', 'https://api.telegram.org')}/bot${this.token}`;
  }

  isConfigured(): boolean {
    return Boolean(this.token && this.config.get<string>('notifications.telegramWebhookSecret', ''));
  }

  /** Telegram signs nothing, but echoes the secret we registered the webhook with. */
  checkSecret(header: string | undefined): boolean {
    const secret = this.config.get<string>('notifications.telegramWebhookSecret', '');
    return Boolean(secret) && header === secret;
  }

  /** Points Telegram at our webhook. Run once by the admin after setting the token. */
  async registerWebhook(): Promise<{ ok: boolean; url: string }> {
    const frontend = this.config.get<string>('app.frontendUrl', '').replace(/\/$/, '');
    const prefix = this.config.get<string>('app.apiPrefix', 'api/v1').replace(/^\/|\/$/g, '');
    const url = `${frontend}/${prefix}/telegram/webhook`;
    const { data } = await axios.post(`${this.api}/setWebhook`, {
      url,
      secret_token: this.config.get<string>('notifications.telegramWebhookSecret', ''),
      allowed_updates: ['message', 'callback_query'],
    });
    return { ok: Boolean(data?.ok), url };
  }

  /** Never throws: Telegram retries a failed webhook, and a retry would answer twice. */
  async handle(update: TelegramUpdate): Promise<void> {
    if (update.callback_query) return this.handleCallback(update.callback_query);

    const chatId = update.message?.chat?.id;
    if (chatId == null) return;
    const chat = String(chatId);
    try {
      // A search takes a moment (a photo, then the catalogue): show typing and a
      // placeholder at once, then turn that same message into the answer.
      let placeholder: number | null = null;
      const reply = await this.compose(chat, update, async (query) => {
        await this.action(chat);
        placeholder = await this.send(chat, { text: `🔎 <b>جاري البحث…</b>\n<i>${escapeHtml(shorten(query, 80))}</i>` });
      });
      if (!reply) return;
      const sentId = placeholder ? await this.edit(chat, placeholder, reply) : await this.send(chat, reply);
      if (reply.query && sentId) this.scheduleLiveUpdate(chat, sentId, reply);
    } catch (error) {
      this.logger.warn(`Bot update for chat ${chatId} failed: ${(error as Error).message}`);
      await this.send(chat, { text: '😕 حصلت مشكلة مؤقتة، جرّب تاني بعد دقيقة.' }).catch(() => undefined);
    }
  }

  /** The reply as plain HTML text (what the tests and callers that only need the words use). */
  async respond(chatId: string, update: TelegramUpdate): Promise<string | null> {
    return (await this.compose(chatId, update))?.text ?? null;
  }

  async compose(
    chatId: string,
    update: TelegramUpdate,
    onSearching?: (query: string) => Promise<void>,
  ): Promise<ShownMessage | null> {
    const message = update.message!;
    const text = (message.text ?? message.caption ?? '').trim();
    const site = this.site();

    if (text === '/start' || text === '/help') {
      return {
        text: [
          '👋 <b>أهلًا بيك في PriceLens</b>',
          '',
          'ابعتلي أي حاجة من دول، وأنا أجيبلك أرخص الأسعار في مصر:',
          '📝 اسم منتج',
          '🔗 رابط من أي متجر',
          '📷 صورة أو سكرين شوت <i>(لمشتركي Plus)</i>',
          '',
          '🔔 <b>لربط التنبيهات:</b> ابعت الرمز اللي في صفحة الإشعارات.',
          '',
          '<i>Send a product name, a store link or a photo and I will find the lowest prices in Egypt.</i>',
        ].join('\n'),
        buttons: site ? [[{ text: '🌐 افتح PriceLens', url: site }]] : undefined,
      };
    }

    if (VERIFY_CODE.test(text)) {
      await this.cache.client.set(VERIFY_KEY(text), chatId, 'EX', 30 * 60);
      return { text: '✅ <b>تم استلام الرمز</b>\nارجع لصفحة الإشعارات على PriceLens واضغط «تأكيد».' };
    }

    const plan = await this.planFor(chatId);
    const allowance = await this.spend(chatId, plan.paid ? DAILY_LIMIT.paid : DAILY_LIMIT.free);
    if (allowance < 0) {
      return {
        text: plan.paid
          ? '⏳ وصلت للحد اليومي للبحث. جرّب بكرة.'
          : '⏳ وصلت للحد اليومي المجاني (10 عمليات بحث).\nاربط حسابك المدفوع من صفحة الإشعارات لعدد أكبر.',
      };
    }

    let query = text;
    if (message.photo?.length) {
      if (!plan.userId || !plan.imageSearch) return { text: '📷 البحث بالصورة متاح لمشتركي <b>Plus</b>.\nاربط حسابك من صفحة الإشعارات على PriceLens.' };
      const photo = message.photo[message.photo.length - 1];
      await onSearching?.('📷 …');
      const image = await this.download(photo.file_id);
      try {
        const recognised = await this.imageSearch.recognise(plan.userId, image);
        if (!recognised.found || !recognised.query) return { text: '🤔 مقدرتش أتعرّف على المنتج في الصورة.\nجرّب صورة أوضح أو ابعت اسمه.' };
        query = recognised.query;
      } catch (error) {
        if (error instanceof AppException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) return { text: '⏳ وصلت للحد اليومي للبحث بالصورة.' };
        throw error;
      }
    } else if (/^https?:\/\//i.test(text)) {
      query = await this.queryFromLink(text);
    }

    if (query.length < 2) return { text: 'ابعت اسم منتج أو رابط أو صورة 🙂' };
    if (!message.photo?.length) await onSearching?.(query);
    return { ...(await this.card(query)), query };
  }

  /** A press on "refresh prices": the same message, searched again. */
  private async handleCallback(callback: NonNullable<TelegramUpdate['callback_query']>): Promise<void> {
    const chatId = callback.message?.chat?.id;
    const messageId = callback.message?.message_id;
    try {
      const id = callback.data?.startsWith('r:') ? callback.data.slice(2) : null;
      const query = id ? await this.cache.client.get(QUERY_KEY(id)).catch(() => null) : null;
      if (chatId == null || messageId == null || !query) {
        await this.answerCallback(callback.id, 'انتهت صلاحية الرسالة، ابعت اسم المنتج تاني.');
        return;
      }
      const chat = String(chatId);
      const plan = await this.planFor(chat);
      if ((await this.spend(chat, plan.paid ? DAILY_LIMIT.paid : DAILY_LIMIT.free)) < 0) {
        await this.answerCallback(callback.id, 'وصلت للحد اليومي للبحث.', true);
        return;
      }
      await this.answerCallback(callback.id, '🔄 بحدّث الأسعار…');
      const fresh = await this.card(query);
      await this.edit(chat, messageId, fresh);
      this.scheduleLiveUpdate(chat, messageId, { ...fresh, query });
    } catch (error) {
      this.logger.warn(`Bot callback failed: ${(error as Error).message}`);
      await this.answerCallback(callback.id, 'حصلت مشكلة مؤقتة.').catch(() => undefined);
    }
  }

  /**
   * Searching also queues a live fetch from the stores, so a price can change
   * a few seconds later. Check once after the fetch has had time to land and,
   * if a price moved, update the message in place and say so.
   */
  private scheduleLiveUpdate(chatId: string, messageId: number, shown: ShownMessage) {
    if (!shown.query || LIVE_FOLLOW_UP_MS <= 0) return;
    const query = shown.query;
    const timer = setTimeout(() => {
      void (async () => {
        const fresh = await this.card(query, { liveFetch: false });
        if (fresh.prices === shown.prices) return;
        await this.edit(chatId, messageId, { ...fresh, text: `${fresh.text}\n\n🔄 <i>تم تحديث الأسعار تلقائيًا</i>` });
      })().catch((error) => this.logger.debug(`Live update skipped: ${(error as Error).message}`));
    }, LIVE_FOLLOW_UP_MS);
    timer.unref?.();
  }

  /** The text of {@link card}, for callers that only need the words. */
  async answer(query: string): Promise<string> {
    return (await this.card(query)).text;
  }

  /**
   * The three best matches as a card: title, lowest price and where, how many
   * stores, the best-installment hint, and one button per product plus refresh.
   * `prices` is a fingerprint of what is shown, to see whether a later check
   * found anything new.
   */
  async card(query: string, options: { liveFetch?: boolean } = {}): Promise<BotMessage & { prices: string }> {
    const results = await this.search.search({ q: query.slice(0, 120), limit: 3, sortBy: 'relevance' } as never, options);
    const hits = (results.hits ?? []) as Array<{ id: string; slug: string; title: string; titleAr: string | null; minPriceUsd: number | null; listingCount: number }>;
    if (hits.length === 0) {
      return {
        text: `🔍 مالقيتش <b>${escapeHtml(shorten(query, 80))}</b> عندنا لسه.\nبدأنا ندوّر عليه في المتاجر، جرّب كمان شوية.`,
        prices: '',
      };
    }

    const site = this.site();
    const maxAgeDays = this.config.get<number>('pricing.offerMaxAgeDays', 7);
    const lines = [`🔎 <b>نتائج البحث</b> · <i>${escapeHtml(shorten(query, 60))}</i>`, ''];
    const buttons: TelegramButton[][] = [];
    const fingerprint: string[] = [];

    for (const [index, hit] of hits.entries()) {
      const cheapest = await this.prisma.sourceListing
        .findFirst({
          where: { canonicalProductId: hit.id, ...liveOfferWhere({ maxAgeDays }) },
          orderBy: { priceUsd: 'asc' },
          select: { priceUsd: true, platform: { select: { name: true } } },
        })
        .catch(() => null);
      const price = cheapest?.priceUsd != null ? Number(cheapest.priceUsd) : hit.minPriceUsd;
      fingerprint.push(`${hit.id}:${price ?? ''}`);
      const title = shorten(hit.titleAr ?? hit.title, 70);

      lines.push(`${numberEmoji(index + 1)} <b>${escapeHtml(title)}</b>`);
      lines.push(
        price != null
          ? `💰 <b>${escapeHtml(formatMoney(price))}</b>  ·  🏪 ${hit.listingCount} عرض`
          : '💰 لا يوجد سعر حالي',
      );
      if (cheapest?.platform?.name) lines.push(`🥇 الأرخص في <b>${escapeHtml(cheapest.platform.name)}</b>`);
      lines.push('');
      if (site) buttons.push([{ text: `🔗 ${index + 1}. ${shorten(title, 34)}`, url: `${site}/products/${hit.slug}` }]);
    }

    const top = await this.extras.forProduct(hits[0].id, null).catch(() => null);
    const plans = top?.installments.access === 'locked' && top.installments.count > 0 ? top.installments.count : 0;
    if (plans) lines.push(`💳 فيه ${plans} خطة تقسيط لأول منتج، شوفها على الموقع.`);
    lines.push(`🕒 <i>آخر تحديث ${cairoTime()}</i>`);

    const id = randomBytes(6).toString('hex');
    await this.cache.client.set(QUERY_KEY(id), query.slice(0, 120), 'EX', QUERY_TTL_SECONDS).catch(() => undefined);
    buttons.push([{ text: '🔄 تحديث الأسعار', callback_data: `r:${id}` }]);

    return { text: lines.join('\n').trim(), buttons, prices: fingerprint.join('|') };
  }

  /** A store link: the product we hold for it, else the words in its path. */
  async queryFromLink(link: string): Promise<string> {
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      return '';
    }
    const path = url.pathname.replace(/\/+$/, '');
    if (path.length > 3) {
      const listing = await this.prisma.sourceListing.findFirst({
        where: { externalUrl: { contains: path }, canonicalProductId: { not: null } },
        select: { canonicalProduct: { select: { title: true } } },
      });
      if (listing?.canonicalProduct) return listing.canonicalProduct.title.slice(0, 120);
    }
    const words = decodeURIComponent(path)
      .split(/[/\-_+.]+/)
      .filter((w) => w.length > 1 && !/^(dp|p|product|products|ar|en|eg|ae|item|html?|[a-z]?\d{6,}|[A-Z0-9]{10})$/i.test(w));
    return words.slice(0, 8).join(' ');
  }

  /** Who this chat belongs to, through a verified Telegram alert channel. */
  private async planFor(chatId: string): Promise<{ userId: string | null; paid: boolean; imageSearch: boolean }> {
    const channel = await this.prisma.notificationChannel.findFirst({
      where: { type: NotificationChannelType.TELEGRAM, destination: chatId, verified: true },
      select: { userId: true },
    });
    if (!channel) return { userId: null, paid: false, imageSearch: false };
    const { tier, limits } = await this.entitlements.getEntitlements(channel.userId);
    return { userId: channel.userId, paid: tier !== 'FREE', imageSearch: limits.features.includes(FEATURES.IMAGE_SEARCH) };
  }

  /** Remaining after this use; negative = over today's limit. */
  private async spend(chatId: string, limit: number): Promise<number> {
    const key = `tg-bot:${chatId}:${new Date().toISOString().slice(0, 10)}`;
    const used = await this.cache.client.incr(key);
    if (used === 1) await this.cache.client.expire(key, 2 * 24 * 60 * 60);
    return limit - used;
  }

  private async download(fileId: string) {
    const { data } = await axios.get(`${this.api}/getFile`, { params: { file_id: fileId }, timeout: 15_000 });
    const filePath = data?.result?.file_path as string | undefined;
    if (!filePath) throw new Error('Telegram returned no file path');
    const base = this.config.get<string>('notifications.telegramApiBase', 'https://api.telegram.org');
    const file = await axios.get<ArrayBuffer>(`${base}/file/bot${this.token}/${filePath}`, { responseType: 'arraybuffer', timeout: 20_000 });
    const buffer = Buffer.from(file.data);
    return { buffer, mimetype: filePath.endsWith('.png') ? 'image/png' : 'image/jpeg', size: buffer.length };
  }

  private site(): string {
    return this.config.get<string>('app.frontendUrl', '').replace(/\/$/, '');
  }

  private markup(message: BotMessage) {
    return message.buttons?.length ? { inline_keyboard: message.buttons } : undefined;
  }

  /** Strips the tags, for the rare message Telegram refuses to parse. */
  private plain(html: string): string {
    return html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }

  /** Returns the new message's id, or null when Telegram did not give one. */
  private async send(chatId: string, message: BotMessage): Promise<number | null> {
    const body = { chat_id: chatId, disable_web_page_preview: true, reply_markup: this.markup(message) };
    try {
      const { data } = await axios.post(`${this.api}/sendMessage`, { ...body, text: message.text, parse_mode: 'HTML' }, { timeout: 10_000 });
      return (data?.result?.message_id as number | undefined) ?? null;
    } catch {
      const { data } = await axios.post(`${this.api}/sendMessage`, { ...body, text: this.plain(message.text) }, { timeout: 10_000 });
      return (data?.result?.message_id as number | undefined) ?? null;
    }
  }

  /** Edits a message in place; falls back to a new message if it cannot be edited. */
  private async edit(chatId: string, messageId: number, message: BotMessage): Promise<number | null> {
    try {
      await axios.post(
        `${this.api}/editMessageText`,
        { chat_id: chatId, message_id: messageId, text: message.text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: this.markup(message) },
        { timeout: 10_000 },
      );
      return messageId;
    } catch (error) {
      // "message is not modified" is not a failure; anything else gets a fresh message.
      const description = (error as { response?: { data?: { description?: string } } }).response?.data?.description ?? '';
      if (/not modified/i.test(description)) return messageId;
      return this.send(chatId, message);
    }
  }

  private async action(chatId: string): Promise<void> {
    await axios.post(`${this.api}/sendChatAction`, { chat_id: chatId, action: 'typing' }, { timeout: 5_000 }).catch(() => undefined);
  }

  private async answerCallback(callbackId: string, text: string, alert = false): Promise<void> {
    await axios.post(`${this.api}/answerCallbackQuery`, { callback_query_id: callbackId, text, show_alert: alert }, { timeout: 5_000 }).catch(() => undefined);
  }
}
