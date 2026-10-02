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
}

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
      allowed_updates: ['message'],
    });
    return { ok: Boolean(data?.ok), url };
  }

  /** Never throws: Telegram retries a failed webhook, and a retry would answer twice. */
  async handle(update: TelegramUpdate): Promise<void> {
    const chatId = update.message?.chat?.id;
    if (chatId == null) return;
    try {
      const reply = await this.respond(String(chatId), update);
      if (reply) await this.send(String(chatId), reply);
    } catch (error) {
      this.logger.warn(`Bot update for chat ${chatId} failed: ${(error as Error).message}`);
      await this.send(String(chatId), 'حصلت مشكلة مؤقتة، جرّب تاني بعد دقيقة.').catch(() => undefined);
    }
  }

  async respond(chatId: string, update: TelegramUpdate): Promise<string | null> {
    const message = update.message!;
    const text = (message.text ?? message.caption ?? '').trim();

    if (text === '/start' || text === '/help') {
      return [
        'أهلًا! ابعتلي اسم منتج، أو رابط من أي متجر، أو صورة/سكرين شوت، وأنا أقولك أرخص الأسعار في مصر.',
        'Send a product name, a store link, or a photo, and I will find the lowest prices in Egypt.',
        '',
        'لربط تنبيهاتك: ابعت الرمز اللي ظاهر في صفحة الإشعارات على Pricelens.',
      ].join('\n');
    }

    if (VERIFY_CODE.test(text)) {
      await this.cache.client.set(VERIFY_KEY(text), chatId, 'EX', 30 * 60);
      return 'تم استلام الرمز ✅ ارجع لصفحة الإشعارات على Pricelens واضغط "تأكيد".';
    }

    const plan = await this.planFor(chatId);
    const allowance = await this.spend(chatId, plan.paid ? DAILY_LIMIT.paid : DAILY_LIMIT.free);
    if (allowance < 0) {
      return plan.paid
        ? 'وصلت للحد اليومي للبحث. جرّب بكرة.'
        : 'وصلت للحد اليومي المجاني (10 عمليات بحث). اربط حسابك المدفوع من صفحة الإشعارات لعدد أكبر.';
    }

    let query = text;
    if (message.photo?.length) {
      if (!plan.userId || !plan.imageSearch) return 'البحث بالصورة متاح لمشتركي Plus. اربط حسابك من صفحة الإشعارات على Pricelens.';
      const photo = message.photo[message.photo.length - 1];
      const image = await this.download(photo.file_id);
      try {
        const recognised = await this.imageSearch.recognise(plan.userId, image);
        if (!recognised.found || !recognised.query) return 'مقدرتش أتعرّف على المنتج في الصورة. جرّب صورة أوضح أو ابعت اسمه.';
        query = recognised.query;
      } catch (error) {
        if (error instanceof AppException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) return 'وصلت للحد اليومي للبحث بالصورة.';
        throw error;
      }
    } else if (/^https?:\/\//i.test(text)) {
      query = await this.queryFromLink(text);
    }

    if (query.length < 2) return 'ابعت اسم منتج أو رابط أو صورة.';
    return this.answer(query);
  }

  /** The three cheapest matches, the best installment plan, and the product page. */
  async answer(query: string): Promise<string> {
    const results = await this.search.search({ q: query.slice(0, 120), limit: 3, sortBy: 'relevance' } as never);
    const hits = (results.hits ?? []) as Array<{ id: string; slug: string; title: string; titleAr: string | null; minPriceUsd: number | null; listingCount: number }>;
    if (hits.length === 0) return `مالقيتش "${query}" عندنا لسه. بدأنا ندوّر عليه في المتاجر، جرّب كمان شوية.`;

    const site = this.config.get<string>('app.frontendUrl', '').replace(/\/$/, '');
    const lines = [`نتائج "${query}":`, ''];
    for (const hit of hits) {
      const price = hit.minPriceUsd != null ? `${Math.round(hit.minPriceUsd).toLocaleString('en-US')} ج.م` : 'لا يوجد سعر حالي';
      lines.push(`• ${hit.titleAr ?? hit.title}`, `  من ${price} في ${hit.listingCount} عرض`, `  ${site}/products/${hit.slug}`, '');
    }
    const top = await this.extras.forProduct(hits[0].id, null).catch(() => null);
    const plan = top?.installments.access === 'locked' && top.installments.count > 0 ? top.installments.count : 0;
    if (plan) lines.push(`💳 فيه ${plan} خطة تقسيط لأول منتج، شوفها على الموقع.`);
    return lines.join('\n').trim();
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

  private async send(chatId: string, text: string): Promise<void> {
    await axios.post(`${this.api}/sendMessage`, { chat_id: chatId, text, disable_web_page_preview: true }, { timeout: 10_000 });
  }
}
