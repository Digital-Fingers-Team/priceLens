import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannelType } from '@prisma/client';
import * as webpush from 'web-push';
import { DeliveryContext, DeliveryResult, NotificationChannelDriver, OutboundNotification } from './notification-channel.interface';

/** What the browser hands us from PushManager.subscribe(). */
export interface StoredPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function isPushSubscription(value: unknown): value is StoredPushSubscription {
  const v = value as StoredPushSubscription | null;
  return Boolean(
    v &&
      typeof v.endpoint === 'string' &&
      /^https:\/\//.test(v.endpoint) &&
      v.keys &&
      typeof v.keys.p256dh === 'string' &&
      typeof v.keys.auth === 'string',
  );
}

/**
 * Browser push through the Web Push protocol, signed with our VAPID keys.
 * No third-party account: the keys are generated once (npx web-push
 * generate-vapid-keys) and kept in .env. Unset keys disable the channel
 * cleanly (deliveries SKIPPED), like SMTP and Telegram.
 */
@Injectable()
export class WebPushChannel implements NotificationChannelDriver {
  readonly type = NotificationChannelType.WEB_PUSH;
  private readonly logger = new Logger(WebPushChannel.name);
  private readonly configured: boolean;
  readonly publicKey: string | null;

  constructor(config: ConfigService) {
    const publicKey = config.get<string>('notifications.webPushPublicKey', '');
    const privateKey = config.get<string>('notifications.webPushPrivateKey', '');
    const subject = config.get<string>('notifications.webPushSubject', '');
    let configured = false;
    if (publicKey && privateKey && subject) {
      try {
        webpush.setVapidDetails(subject, publicKey, privateKey);
        configured = true;
      } catch (error) {
        this.logger.error(`Web push disabled: bad VAPID settings (${(error as Error).message})`);
      }
    }
    this.configured = configured;
    this.publicKey = configured ? publicKey : null;
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async send(_destination: string, notification: OutboundNotification, context?: DeliveryContext): Promise<DeliveryResult> {
    if (!this.configured) return { ok: false, skipped: true, error: 'Web push keys not configured' };
    const subscription = context?.pushSubscription;
    if (!isPushSubscription(subscription)) return { ok: false, skipped: true, error: 'No browser subscription' };

    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify({ title: notification.title, body: notification.body, url: notification.url ?? null }),
        { TTL: 24 * 60 * 60, urgency: 'normal' },
      );
      return { ok: true };
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      // 404/410: the browser unsubscribed or the subscription expired; it
      // will never work again, so the channel is retired rather than retried.
      if (status === 404 || status === 410) return { ok: false, error: 'Browser subscription expired', gone: true };
      return { ok: false, error: (error as Error).message };
    }
  }
}
