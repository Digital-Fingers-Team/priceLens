import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationChannelType,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { FEATURES } from '../billing/plan-limits';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { InAppChannel } from './channels/in-app.channel';
import { EmailChannel } from './channels/email.channel';
import { TelegramChannel } from './channels/telegram.channel';
import { WebPushChannel } from './channels/web-push.channel';
import { NotificationChannelDriver, OutboundNotification } from './channels/notification-channel.interface';

export interface DispatchInput {
  userId: string;
  /** Stable machine key, e.g. "price_alert.triggered". */
  type: string;
  title: string;
  body: string;
  /** App-relative path; turned into an absolute URL for external channels. */
  path?: string | null;
  data?: Record<string, unknown>;
  priceAlertId?: string | null;
  /**
   * Collapses duplicates. When provided, a notification of the same type with
   * the same key sent to the same user inside `dedupeWindowMinutes` is
   * dropped. This is what stops a flapping price from mailing someone nine
   * times in an hour.
   */
  dedupeKey?: string;
  dedupeWindowMinutes?: number;
  /**
   * May wait for the daily digest. With the realtime_alerts flag on, an email
   * for a user whose plan lacks real-time alerts is held (delivery PENDING)
   * and sent with the day's others by sendDailyDigests(). In-app is always
   * immediate. Off for anything time-critical (billing, invitations).
   */
  digestable?: boolean;
}

export interface DispatchResult {
  notificationId: string | null;
  delivered: NotificationChannelType[];
  failed: NotificationChannelType[];
  skipped: NotificationChannelType[];
  /** Held for the daily digest. */
  queued?: NotificationChannelType[];
  suppressed?: 'duplicate' | 'rate_limited';
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly drivers: Map<NotificationChannelType, NotificationChannelDriver>;
  private readonly frontendUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly entitlements: EntitlementsService,
    private readonly flags: FeatureFlagsService,
    inApp: InAppChannel,
    email: EmailChannel,
    telegram: TelegramChannel,
    webPush: WebPushChannel,
  ) {
    this.drivers = new Map<NotificationChannelType, NotificationChannelDriver>([
      [inApp.type, inApp],
      [email.type, email],
      [telegram.type, telegram],
      [webPush.type, webPush],
    ]);
    this.frontendUrl = this.config.get<string>('app.frontendUrl', 'http://localhost:3000').replace(/\/$/, '');
  }

  /**
   * Write the notification and fan it out to the user's channels.
   *
   * Ordering matters: the Notification row is committed *before* any external
   * send is attempted, so a user is never silently un-notified because SMTP
   * timed out — the in-app inbox is the durable record and the external
   * channels are best-effort on top of it.
   */
  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    const empty: DispatchResult = { notificationId: null, delivered: [], failed: [], skipped: [] };

    if (input.dedupeKey && (await this.isDuplicate(input))) {
      return { ...empty, suppressed: 'duplicate' };
    }
    if (await this.isRateLimited(input.userId)) {
      this.logger.warn(`Suppressing notification for user ${input.userId}: hourly cap reached`);
      return { ...empty, suppressed: 'rate_limited' };
    }

    const url = input.path ? `${this.frontendUrl}${input.path.startsWith('/') ? '' : '/'}${input.path}` : null;

    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title.slice(0, 255),
        body: input.body,
        url,
        // dedupeKey is persisted into `data` because isDuplicate() matches on
        // it; keeping it out of a column avoids another index on a table that
        // is already append-heavy.
        data: {
          ...(input.data ?? {}),
          ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
        } as Prisma.InputJsonValue,
        priceAlertId: input.priceAlertId ?? null,
      },
    });

    const targets = await this.resolveTargets(input.userId);
    const outbound: OutboundNotification = {
      title: input.title,
      body: input.body,
      url,
      data: { ...(input.data ?? {}), notificationType: input.type },
    };

    const result: DispatchResult = { notificationId: notification.id, delivered: [], failed: [], skipped: [] };

    // Sequential rather than parallel: the fan-out is at most three channels,
    // and serialising keeps one slow SMTP connection from being multiplied
    // across every user in an alert sweep.
    const holdEmail = input.digestable === true && !(await this.isRealtime(input.userId));

    for (const target of targets) {
      const driver = this.drivers.get(target.type);
      if (!driver) continue;

      if (holdEmail && target.type === NotificationChannelType.EMAIL) {
        await this.prisma.notificationDelivery.upsert({
          where: { notificationId_channelType: { notificationId: notification.id, channelType: target.type } },
          create: { notificationId: notification.id, channelId: target.channelId, channelType: target.type, status: NotificationStatus.PENDING },
          update: {},
        });
        (result.queued ??= []).push(target.type);
        continue;
      }

      const outcome = driver.isConfigured()
        ? await driver.send(target.destination, outbound, { pushSubscription: target.pushSubscription })
        : { ok: false, skipped: true, error: `${target.type} is not configured on this deployment` };

      const status = outcome.ok
        ? NotificationStatus.SENT
        : outcome.skipped
          ? NotificationStatus.SKIPPED
          : NotificationStatus.FAILED;

      await this.prisma.notificationDelivery.upsert({
        where: {
          notificationId_channelType: { notificationId: notification.id, channelType: target.type },
        },
        create: {
          notificationId: notification.id,
          channelId: target.channelId,
          channelType: target.type,
          status,
          attempts: 1,
          error: outcome.error ?? null,
          sentAt: outcome.ok ? new Date() : null,
        },
        update: {
          status,
          attempts: { increment: 1 },
          error: outcome.error ?? null,
          sentAt: outcome.ok ? new Date() : null,
        },
      });

      if (target.channelId) {
        await this.prisma.notificationChannel.update({
          where: { id: target.channelId },
          data: outcome.ok
            ? { lastUsedAt: new Date(), failureCount: 0 }
            : outcome.gone
              ? { isActive: false, failureCount: { increment: 1 } }
              : outcome.skipped
                ? {}
                : { failureCount: { increment: 1 } },
        });
      }

      if (outcome.ok) result.delivered.push(target.type);
      else if (outcome.skipped) result.skipped.push(target.type);
      else {
        result.failed.push(target.type);
        this.logger.warn(`Delivery to ${target.type} failed for user ${input.userId}: ${outcome.error}`);
      }
    }

    return result;
  }

  /**
   * Which destinations to send to.
   *
   * IN_APP is unconditional — the inbox always gets it. External channels must
   * be active, verified, and permitted by the user's plan; a plan downgrade
   * therefore stops Telegram delivery without any separate cleanup step.
   */
  private async resolveTargets(
    userId: string,
  ): Promise<Array<{ type: NotificationChannelType; destination: string; channelId: string | null; pushSubscription?: unknown }>> {
    const [channels, { limits }] = await Promise.all([
      this.prisma.notificationChannel.findMany({ where: { userId, isActive: true } }),
      this.entitlements.getEntitlements(userId),
    ]);

    const allowed = new Set(limits.notificationChannels);
    const targets: Array<{ type: NotificationChannelType; destination: string; channelId: string | null; pushSubscription?: unknown }> = [
      { type: NotificationChannelType.IN_APP, destination: userId, channelId: null },
    ];

    for (const channel of channels) {
      if (channel.type === NotificationChannelType.IN_APP) continue;
      if (!allowed.has(channel.type)) continue;
      if (!channel.verified || !channel.destination) continue;

      // A channel that keeps bouncing is parked rather than retried forever;
      // the user re-verifies to bring it back.
      if (channel.failureCount >= 10) {
        this.logger.warn(`Channel ${channel.id} (${channel.type}) disabled after repeated failures`);
        continue;
      }

      targets.push({
        type: channel.type,
        destination: channel.destination,
        channelId: channel.id,
        pushSubscription: channel.pushSubscription ?? undefined,
      });
    }

    return targets;
  }

  private async isDuplicate(input: DispatchInput): Promise<boolean> {
    const windowMinutes = input.dedupeWindowMinutes ?? 360;
    const since = new Date(Date.now() - windowMinutes * 60_000);

    const existing = await this.prisma.notification.findFirst({
      where: {
        userId: input.userId,
        type: input.type,
        createdAt: { gte: since },
        data: { path: ['dedupeKey'], equals: input.dedupeKey },
      },
      select: { id: true },
    });

    return existing !== null;
  }

  private async isRateLimited(userId: string): Promise<boolean> {
    const cap = this.config.get<number>('notifications.maxPerUserPerHour', 20);
    if (cap <= 0) return false;

    const since = new Date(Date.now() - 60 * 60_000);
    const count = await this.prisma.notification.count({
      where: { userId, createdAt: { gte: since } },
    });
    return count >= cap;
  }

  // ─── Inbox ─────────────────────────────────────────────────────────────

  async list(userId: string, options: { limit?: number; cursor?: string; unreadOnly?: boolean } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

    const items = await this.prisma.notification.findMany({
      where: { userId, ...(options.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    return {
      items: page.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        body: item.body,
        url: item.url,
        data: item.data,
        readAt: item.readAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** Scoped by userId in the same statement so one user cannot read another's. */
  async markRead(userId: string, notificationId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return count;
  }

  /**
   * Real-time external delivery: everyone while the realtime_alerts flag is
   * off (the behaviour before it existed), else plans with the feature.
   */
  private async isRealtime(userId: string): Promise<boolean> {
    if (!(await this.flags.isEnabled(FEATURES.REALTIME_ALERTS))) return true;
    const { limits } = await this.entitlements.getEntitlements(userId);
    return limits.features.includes(FEATURES.REALTIME_ALERTS);
  }

  /**
   * One email per user with every alert held since the last digest. A user's
   * rows end SENT, FAILED (the retry job resends them one by one) or SKIPPED
   * (no verified address); none stays PENDING, so nothing is sent twice.
   * Runs as one Bull job on the worker, never concurrently with itself.
   */
  async sendDailyDigests(batchSize = 5000): Promise<{ users: number; alerts: number }> {
    const held = await this.prisma.notificationDelivery.findMany({
      where: { status: NotificationStatus.PENDING, channelType: NotificationChannelType.EMAIL },
      include: { notification: true, channel: true },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });
    if (held.length === 0) return { users: 0, alerts: 0 };

    const byUser = new Map<string, typeof held>();
    for (const delivery of held) {
      const list = byUser.get(delivery.notification.userId) ?? [];
      list.push(delivery);
      byUser.set(delivery.notification.userId, list);
    }

    const email = this.drivers.get(NotificationChannelType.EMAIL)!;
    let users = 0;
    for (const deliveries of byUser.values()) {
      const ids = deliveries.map((d) => d.id);

      const channel = deliveries.find((d) => d.channel)?.channel;
      if (!channel?.destination || !channel.isActive || !channel.verified || !email.isConfigured()) {
        await this.prisma.notificationDelivery.updateMany({
          where: { id: { in: ids } },
          data: { status: NotificationStatus.SKIPPED, error: 'No usable email channel for the digest' },
        });
        continue;
      }

      const lines = deliveries.map((d) => `• ${d.notification.title}\n  ${d.notification.body}${d.notification.url ? `\n  ${d.notification.url}` : ''}`);
      const outcome = await email.send(channel.destination, {
        title: `ملخص تنبيهات الأسعار (${deliveries.length})`,
        body: lines.join('\n\n'),
        url: `${this.frontendUrl}/notifications`,
      });
      await this.prisma.notificationDelivery.updateMany({
        where: { id: { in: ids } },
        data: outcome.ok
          ? { status: NotificationStatus.SENT, sentAt: new Date(), error: null, attempts: { increment: 1 } }
          : { status: NotificationStatus.FAILED, error: outcome.error ?? 'Digest failed', attempts: { increment: 1 } },
      });
      if (outcome.ok) users += 1;
    }

    this.logger.log(`Daily digest: ${users} email(s) covering ${held.length} alert(s)`);
    return { users, alerts: held.length };
  }

  /**
   * Retry deliveries that failed transiently.
   *
   * Idempotent and bounded: only FAILED rows under the attempt cap are picked
   * up, and each retry increments `attempts`, so a permanently bad address
   * drains out of the queue instead of being retried forever.
   */
  async retryFailedDeliveries(batchSize = 100): Promise<{ retried: number; recovered: number }> {
    const maxAttempts = this.config.get<number>('notifications.maxDeliveryAttempts', 4);

    const pending = await this.prisma.notificationDelivery.findMany({
      where: { status: NotificationStatus.FAILED, attempts: { lt: maxAttempts } },
      include: { notification: true, channel: true },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });

    let recovered = 0;

    for (const delivery of pending) {
      const driver = this.drivers.get(delivery.channelType);
      const destination = delivery.channel?.destination;

      if (!driver || !destination || !driver.isConfigured() || !delivery.channel?.isActive) {
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: { status: NotificationStatus.SKIPPED, attempts: { increment: 1 } },
        });
        continue;
      }

      const outcome = await driver.send(
        destination,
        {
          title: delivery.notification.title,
          body: delivery.notification.body,
          url: delivery.notification.url,
          data: { ...((delivery.notification.data as Record<string, unknown> | null) ?? {}), notificationType: delivery.notification.type },
        },
        { pushSubscription: delivery.channel?.pushSubscription ?? undefined },
      );

      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: outcome.ok ? NotificationStatus.SENT : NotificationStatus.FAILED,
          attempts: { increment: 1 },
          error: outcome.error ?? null,
          sentAt: outcome.ok ? new Date() : null,
        },
      });

      if (outcome.ok) recovered += 1;
    }

    if (pending.length > 0) {
      this.logger.log(`Retried ${pending.length} failed delivery(ies), ${recovered} recovered`);
    }
    return { retried: pending.length, recovered };
  }
}
