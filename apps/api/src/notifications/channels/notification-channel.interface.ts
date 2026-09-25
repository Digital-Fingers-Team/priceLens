import { NotificationChannelType } from '@prisma/client';

export interface OutboundNotification {
  title: string;
  body: string;
  /** Absolute URL into the app, when there is somewhere to go. */
  url?: string | null;
  data?: Record<string, unknown>;
}

export interface DeliveryResult {
  ok: boolean;
  /** True when the channel is not configured on this deployment. Recorded as
   *  SKIPPED rather than FAILED so it is never retried and never alarms. */
  skipped?: boolean;
  error?: string;
}

/**
 * One transport for delivering a notification.
 *
 * Modelled on the existing AffiliateProvider registry: implementations are
 * registered by `type` and resolved at dispatch time, so adding SMS or web
 * push later is a new class plus a provider entry, with no changes to the
 * alert engine.
 */
export interface NotificationChannelDriver {
  readonly type: NotificationChannelType;

  /** Whether this deployment has the credentials to actually send. */
  isConfigured(): boolean;

  /**
   * `destination` is the channel row's destination (email address, Telegram
   * chat id). Implementations must not throw — a transport failure is a
   * DeliveryResult, because one dead channel must not abort the others.
   */
  send(destination: string, notification: OutboundNotification): Promise<DeliveryResult>;
}
