import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannelType } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import { DeliveryResult, NotificationChannelDriver, OutboundNotification } from './notification-channel.interface';

/** Telegram MarkdownV2 reserves a long list of characters; any unescaped one
 *  makes the whole message fail to parse. Product titles are full of them. */
function escapeMarkdown(value: string): string {
  return value.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (match) => `\\${match}`);
}

@Injectable()
export class TelegramChannel implements NotificationChannelDriver {
  readonly type = NotificationChannelType.TELEGRAM;

  private readonly logger = new Logger(TelegramChannel.name);
  private readonly http: AxiosInstance | null;

  constructor(private readonly config: ConfigService) {
    const token = this.config.get<string>('notifications.telegramBotToken', '');
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN is not set — Telegram notifications are disabled');
      this.http = null;
      return;
    }

    const base = this.config.get<string>('notifications.telegramApiBase', 'https://api.telegram.org');
    this.http = axios.create({
      baseURL: `${base}/bot${token}`,
      timeout: 10_000,
    });
  }

  isConfigured(): boolean {
    return this.http !== null;
  }

  async send(destination: string, notification: OutboundNotification): Promise<DeliveryResult> {
    if (!this.http) return { ok: false, skipped: true, error: 'Telegram bot token not configured' };

    const lines = [`*${escapeMarkdown(notification.title)}*`, '', escapeMarkdown(notification.body)];
    if (notification.url) {
      lines.push('', `[Open on PriceLens](${notification.url})`);
    }

    try {
      const response = await this.http.post('/sendMessage', {
        chat_id: destination,
        text: lines.join('\n'),
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: false,
      });

      if (response.data?.ok === false) {
        return { ok: false, error: response.data?.description ?? 'Telegram rejected the message' };
      }
      return { ok: true };
    } catch (error) {
      const description = (error as { response?: { data?: { description?: string } } }).response?.data?.description;
      return { ok: false, error: description ?? (error as Error).message };
    }
  }

  /**
   * Resolves the chat id for a user who has messaged the bot with their
   * verification code.
   *
   * Telegram bots cannot initiate conversations, so the user must speak
   * first; we read recent updates and look for the code they pasted. Returns
   * null when no matching message is pending.
   */
  async findChatIdByVerificationCode(code: string): Promise<string | null> {
    if (!this.http) return null;

    try {
      const response = await this.http.get('/getUpdates', { params: { limit: 100, timeout: 0 } });
      const updates: Array<{ message?: { text?: string; chat?: { id: number } } }> = response.data?.result ?? [];

      // Newest first: if a user retried, honour the most recent attempt.
      for (const update of updates.reverse()) {
        const text = update.message?.text?.trim();
        const chatId = update.message?.chat?.id;
        if (!text || chatId == null) continue;
        if (text.toUpperCase().includes(code.toUpperCase())) {
          return String(chatId);
        }
      }
      return null;
    } catch (error) {
      this.logger.error(`Failed to poll Telegram updates: ${(error as Error).message}`);
      return null;
    }
  }
}
