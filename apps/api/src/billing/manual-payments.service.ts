import { randomInt } from 'crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ManualPayment,
  ManualPaymentMethod,
  ManualPaymentStatus,
  Plan,
  PlanTier,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UpgradeRequiredException } from './billing.errors';
import { PlansService } from './plans.service';
import { SubscriptionsService } from './subscriptions.service';

/** Orders the customer can still act on; at most one per user (partial index). */
const OPEN_STATUSES: ManualPaymentStatus[] = [ManualPaymentStatus.AWAITING_PAYMENT, ManualPaymentStatus.SUBMITTED];

const DAY_MS = 86_400_000;

export interface PaymentDestinations {
  walletNumber: string | null;
  instapayAddress: string | null;
  instapayLink: string | null;
}

type PaymentWithPlan = ManualPayment & { plan: Plan };

/**
 * Wallet / InstaPay payments the owner confirms by hand.
 *
 * There is no card gateway: the business is not registered, and every
 * Egyptian gateway wants a commercial register. So the customer sends the plan
 * price to the owner's wallet, types the transfer reference, and the owner
 * approves after matching it with the SMS on their phone. Approval is the only
 * thing that grants a plan here.
 */
@Injectable()
export class ManualPaymentsService {
  private readonly logger = new Logger(ManualPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly subscriptions: SubscriptionsService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  /** Where customers send the money; null when payments are off. */
  destinations(): PaymentDestinations | null {
    const walletNumber = this.config.get<string>('billing.walletNumber', '') || null;
    const instapayAddress = this.config.get<string>('billing.instapayAddress', '') || null;
    const link = this.config.get<string>('billing.instapayLink', '');
    // Only InstaPay's own https links: this ends up as an href on the page.
    const instapayLink = instapayAddress && /^https:\/\/ipn\.eg\/[\w/.-]+$/.test(link) ? link : null;
    return walletNumber || instapayAddress ? { walletNumber, instapayAddress, instapayLink } : null;
  }

  get isEnabled(): boolean {
    return this.destinations() !== null;
  }

  /** Enterprise stays "contact sales": its price is above wallet limits. */
  isSellable(plan: Pick<Plan, 'isActive' | 'priceMinor' | 'tier'>): boolean {
    return this.isEnabled && plan.isActive && plan.priceMinor > 0 && plan.tier !== PlanTier.ENTERPRISE;
  }

  // ─── Customer ───────────────────────────────────────────────────────────

  /**
   * The order to pay for `planKey`. Reuses the open one for the same plan (a
   * reload or a second tab must not make a new code); an unpaid order for a
   * different plan is replaced.
   */
  async startOrder(userId: string, planKey: string): Promise<PaymentWithPlan> {
    const plan = await this.plans.findByKey(planKey);
    if (!this.isEnabled) {
      throw new UpgradeRequiredException('Online payment is not enabled yet. Contact us to activate a plan.');
    }
    if (!this.isSellable(plan)) {
      throw new UpgradeRequiredException('This plan is sold directly. Contact sales to get set up.', {
        requiredTier: plan.tier,
      });
    }

    const open = await this.findOpen(userId);
    if (open) {
      if (open.planId === plan.id) return open;
      if (open.status === ManualPaymentStatus.SUBMITTED) {
        throw new ConflictException('You already have a payment waiting for approval. Wait for it, or cancel it first.');
      }
      await this.prisma.manualPayment.update({ where: { id: open.id }, data: { status: ManualPaymentStatus.CANCELLED } });
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.prisma.manualPayment.create({
          data: {
            code: `PL-${randomInt(1000, 100000)}`,
            userId,
            planId: plan.id,
            amountMinor: plan.priceMinor,
            currency: plan.currency,
          },
          include: { plan: true },
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
        // Either the code collided (try another) or a parallel request just
        // opened this user's order (return that one).
        const raced = await this.findOpen(userId);
        if (raced) return raced;
      }
    }
    throw new ConflictException('Could not create the order. Please try again.');
  }

  /** The customer's recent orders, newest first. */
  async listMine(userId: string): Promise<PaymentWithPlan[]> {
    return this.prisma.manualPayment.findMany({
      where: { userId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  /** "I paid": record the transfer reference and tell the owner. */
  async submit(
    userId: string,
    paymentId: string,
    input: { method: ManualPaymentMethod; reference: string; payerAccount?: string },
  ): Promise<PaymentWithPlan> {
    const payment = await this.getOwned(userId, paymentId);
    if (payment.status !== ManualPaymentStatus.AWAITING_PAYMENT) {
      throw new ConflictException('This order has already been sent for approval.');
    }

    const destinations = this.destinations();
    const offered = input.method === ManualPaymentMethod.WALLET ? destinations?.walletNumber : destinations?.instapayAddress;
    if (!offered) throw new BadRequestException('That payment method is not available.');

    const reference = normaliseReference(input.reference);
    if (reference.length < 4) throw new BadRequestException('Enter the transfer reference from your receipt.');

    let updated: PaymentWithPlan;
    try {
      updated = await this.prisma.manualPayment.update({
        where: { id: payment.id },
        data: {
          status: ManualPaymentStatus.SUBMITTED,
          method: input.method,
          reference,
          payerAccount: input.payerAccount?.trim() || null,
          submittedAt: new Date(),
        },
        include: { plan: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This transfer reference has already been used.');
      }
      throw error;
    }

    void this.announceToOwner(updated, userId);
    return updated;
  }

  async cancel(userId: string, paymentId: string): Promise<PaymentWithPlan> {
    const payment = await this.getOwned(userId, paymentId);
    if (!OPEN_STATUSES.includes(payment.status)) {
      throw new ConflictException('This order can no longer be cancelled.');
    }
    return this.prisma.manualPayment.update({
      where: { id: payment.id },
      data: { status: ManualPaymentStatus.CANCELLED },
      include: { plan: true },
    });
  }

  // ─── Owner ──────────────────────────────────────────────────────────────

  async adminList(status?: ManualPaymentStatus) {
    return this.prisma.manualPayment.findMany({
      where: status ? { status } : {},
      include: {
        plan: true,
        user: { select: { id: true, email: true, username: true, displayName: true } },
      },
      // Waiting ones in the order they came in; the rest newest first.
      orderBy: status === ManualPaymentStatus.SUBMITTED ? { submittedAt: 'asc' } : { updatedAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Mark the order paid and grant its plan. Paying again before the current
   * period of the same plan ends adds a full interval on top, so an early
   * renewal loses no days.
   */
  async approve(actorId: string, paymentId: string): Promise<PaymentWithPlan> {
    const payment = await this.prisma.manualPayment.findUnique({ where: { id: paymentId }, include: { plan: true } });
    if (!payment) throw new NotFoundException('Payment not found');

    // Claim it first, so two clicks (or two admins) cannot grant twice.
    const claimed = await this.prisma.manualPayment.updateMany({
      where: { id: payment.id, status: { in: OPEN_STATUSES } },
      data: { status: ManualPaymentStatus.APPROVED, reviewedById: actorId, reviewedAt: new Date() },
    });
    if (claimed.count === 0) throw new ConflictException(`This payment is already ${payment.status.toLowerCase()}.`);

    try {
      const now = new Date();
      const current = await this.subscriptions.getActiveForUser(payment.userId);
      const extendsCurrent =
        current?.planId === payment.planId &&
        current.status === SubscriptionStatus.ACTIVE &&
        current.currentPeriodEnd !== null &&
        current.currentPeriodEnd > now;
      const from = extendsCurrent ? current!.currentPeriodEnd! : now;

      await this.subscriptions.grantPlan(payment.userId, payment.plan.key, {
        provider: 'wallet',
        eventType: 'wallet_payment',
        providerEventId: payment.id,
        currentPeriodStart: extendsCurrent ? current!.currentPeriodStart : now,
        currentPeriodEnd: new Date(from.getTime() + Math.max(payment.plan.intervalDays, 1) * DAY_MS),
      });
    } catch (error) {
      await this.prisma.manualPayment.update({
        where: { id: payment.id },
        data: { status: payment.status, reviewedById: null, reviewedAt: null },
      });
      throw error;
    }

    this.logger.log(`Admin ${actorId} approved payment ${payment.code} (${payment.plan.key}) for user ${payment.userId}`);
    void this.tellCustomer(payment.userId, 'billing.payment_approved', {
      title: 'تم تفعيل اشتراكك',
      body: `استلمنا ${formatAmount(payment.amountMinor, payment.currency)} وتم تفعيل خطتك. شكرًا لك!`,
    });
    return this.prisma.manualPayment.findUniqueOrThrow({ where: { id: payment.id }, include: { plan: true } });
  }

  async reject(actorId: string, paymentId: string, reason?: string): Promise<PaymentWithPlan> {
    const payment = await this.prisma.manualPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');

    const rejected = await this.prisma.manualPayment.updateMany({
      where: { id: payment.id, status: { in: OPEN_STATUSES } },
      data: {
        status: ManualPaymentStatus.REJECTED,
        reviewedById: actorId,
        reviewedAt: new Date(),
        rejectReason: reason?.trim() || null,
      },
    });
    if (rejected.count === 0) throw new ConflictException(`This payment is already ${payment.status.toLowerCase()}.`);

    this.logger.log(`Admin ${actorId} rejected payment ${payment.code}`);
    void this.tellCustomer(payment.userId, 'billing.payment_rejected', {
      title: 'لم نتمكن من تأكيد الدفع',
      body: reason?.trim()
        ? `لم نجد تحويلك برقم ${payment.reference ?? ''}: ${reason.trim()}`
        : `لم نجد تحويلك برقم ${payment.reference ?? ''}. راجع الرقم وحاول مرة أخرى، أو تواصل معنا.`,
    });
    return this.prisma.manualPayment.findUniqueOrThrow({ where: { id: payment.id }, include: { plan: true } });
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private findOpen(userId: string): Promise<PaymentWithPlan | null> {
    return this.prisma.manualPayment.findFirst({
      where: { userId, status: { in: OPEN_STATUSES } },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 404 rather than 403 for someone else's order: ids are not a lookup service. */
  private async getOwned(userId: string, paymentId: string): Promise<PaymentWithPlan> {
    const payment = await this.prisma.manualPayment.findUnique({ where: { id: paymentId }, include: { plan: true } });
    if (!payment || payment.userId !== userId) throw new NotFoundException('Payment not found');
    return payment;
  }

  private async tellCustomer(userId: string, type: string, text: { title: string; body: string }): Promise<void> {
    try {
      await this.notifications.dispatch({ userId, type, ...text, path: '/account/billing' });
    } catch (error) {
      this.logger.warn(`Could not notify user ${userId} about their payment: ${(error as Error).message}`);
    }
  }

  /**
   * A Telegram message to the owner with a button to the approval page. Best
   * effort: the order is already saved and listed in /admin/payments.
   */
  private async announceToOwner(payment: PaymentWithPlan, userId: string): Promise<void> {
    const token = this.config.get<string>('billing.ownerTelegramBotToken', '');
    const chatId = this.config.get<string>('billing.ownerTelegramChatId', '');
    if (!token || !chatId) return;

    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, displayName: true } });
      const frontend = this.config.get<string>('app.frontendUrl', 'http://localhost:3000').replace(/\/$/, '');
      const via = payment.method === ManualPaymentMethod.INSTAPAY ? 'InstaPay' : 'Wallet';
      const text = [
        `💰 New payment to check: ${formatAmount(payment.amountMinor, payment.currency)}`,
        `Plan: ${payment.plan.name}`,
        `From: ${user?.displayName ?? user?.email ?? userId}${payment.payerAccount ? ` (${payment.payerAccount})` : ''}`,
        `Via: ${via}`,
        `Reference: ${payment.reference}`,
        `Order: ${payment.code}`,
      ].join('\n');
      const base = this.config.get<string>('notifications.telegramApiBase', 'https://api.telegram.org');
      await axios.post(
        `${base}/bot${token}/sendMessage`,
        {
          chat_id: chatId,
          text,
          reply_markup: { inline_keyboard: [[{ text: 'Open to approve', url: `${frontend}/admin/payments` }]] },
        },
        { timeout: 10_000 },
      );
    } catch (error) {
      this.logger.warn(`Could not send the owner's payment message: ${(error as Error).message}`);
    }
  }
}

/** Receipts show references with spaces or dashes; compare them bare. */
export function normaliseReference(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase().slice(0, 64);
}

function formatAmount(amountMinor: number, currency: string): string {
  return `${(amountMinor / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;
}
