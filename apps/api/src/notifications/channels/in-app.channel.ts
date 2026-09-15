import { Injectable } from '@nestjs/common';
import { NotificationChannelType } from '@prisma/client';
import { DeliveryResult, NotificationChannelDriver } from './notification-channel.interface';

/**
 * The in-app inbox.
 *
 * Delivery is a no-op because the Notification row written by
 * NotificationService *is* the delivery. It still exists as a driver so the
 * inbox appears in the same per-channel delivery ledger as email and Telegram
 * — one place to answer "was this user actually told?".
 */
@Injectable()
export class InAppChannel implements NotificationChannelDriver {
  readonly type = NotificationChannelType.IN_APP;

  isConfigured(): boolean {
    return true;
  }

  // Takes no arguments on purpose: there is nothing to deliver to. A function
  // of fewer parameters still satisfies the driver interface.
  async send(): Promise<DeliveryResult> {
    return { ok: true };
  }
}
