import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { OPERATIONAL_FLAGS } from '../feature-flags/feature-flags.registry';

/** Providers where nobody charges the customer again automatically. */
export const NON_RENEWING_PROVIDERS = ['wallet', 'paymob', 'mock'];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Once per period, a few days before a plan paid by wallet or Paymob runs
 * out, tell the customer and link the renew page. The plan itself lapses on
 * its own (SubscriptionsService.expireLapsedSubscriptions); this is the
 * graceful part of the downgrade.
 */
@Injectable()
export class RenewalRemindersService {
  private readonly logger = new Logger(RenewalRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly flags: FeatureFlagsService,
    private readonly config: ConfigService,
  ) {}

  async sendDue(now = new Date()): Promise<number> {
    if (!(await this.flags.isEnabled(OPERATIONAL_FLAGS.RENEWAL_REMINDERS))) return 0;

    const days = Math.max(1, this.config.get<number>('billing.renewalReminderDays', 3));
    const due = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        provider: { in: NON_RENEWING_PROVIDERS },
        renewalReminderSentAt: null,
        currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + days * DAY_MS) },
      },
      include: { plan: true },
      take: 200,
    });

    let sent = 0;
    for (const subscription of due) {
      // Claim first: the API and a retried job must not both send it.
      const claimed = await this.prisma.subscription.updateMany({
        where: { id: subscription.id, renewalReminderSentAt: null },
        data: { renewalReminderSentAt: now },
      });
      if (claimed.count === 0) continue;

      const daysLeft = Math.max(1, Math.ceil((subscription.currentPeriodEnd!.getTime() - now.getTime()) / DAY_MS));
      try {
        await this.notifications.dispatch({
          userId: subscription.userId,
          type: 'billing.renewal_due',
          title: 'اشتراكك ينتهي قريبًا',
          body: `خطة ${subscription.plan.name} تنتهي خلال ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'}. جدّدها لتحتفظ بمزاياك.`,
          path: `/account/pay/${subscription.plan.key}`,
          dedupeKey: `renewal:${subscription.id}:${subscription.currentPeriodEnd!.toISOString()}`,
          dedupeWindowMinutes: 7 * 24 * 60,
        });
        sent += 1;
      } catch (error) {
        this.logger.warn(`Renewal reminder for ${subscription.userId} failed: ${(error as Error).message}`);
      }
    }

    if (sent > 0) this.logger.log(`Sent ${sent} renewal reminder(s)`);
    return sent;
  }
}
