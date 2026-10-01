import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Invoice, InvoiceStatus, Plan, SubscriptionStatus, User, UserRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { OPERATIONAL_FLAGS } from '../feature-flags/feature-flags.registry';
import { FeatureDisabledException } from '../feature-flags/feature-flags.errors';
import { PlansService } from './plans.service';
import { SubscriptionsService } from './subscriptions.service';
import { UpgradeRequiredException } from './billing.errors';
import { PAYMENT_PROVIDERS, PaymentEvent, PaymentProvider } from './payments/payment-provider';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Which flag turns each online provider on. */
const PROVIDER_FLAGS = {
  paymob: OPERATIONAL_FLAGS.PAYMOB_CHECKOUT,
  mock: OPERATIONAL_FLAGS.MOCK_CHECKOUT,
} as const;

export type InvoiceWithPlan = Invoice & { plan: Plan };

export interface SettleResult {
  invoiceId: string | null;
  status: InvoiceStatus | 'IGNORED';
}

/**
 * Checkout and settlement for gateways that take one payment per period
 * (Paymob, the test double).
 *
 * The webhook is the only thing that grants a plan; the customer's return to
 * the site just shows the invoice's state. Settlement is idempotent: an
 * invoice is claimed PENDING -> PAID in one conditional update, so a replayed
 * or duplicated callback cannot grant twice.
 */
@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);
  private readonly providers: Map<string, PaymentProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly subscriptions: SubscriptionsService,
    private readonly notifications: NotificationsService,
    private readonly flags: FeatureFlagsService,
    private readonly config: ConfigService,
    @Inject(PAYMENT_PROVIDERS) providers: PaymentProvider[],
  ) {
    this.providers = new Map(providers.map((provider) => [provider.id, provider]));
  }

  /** Providers a customer can pick right now: configured and switched on. */
  async availableProviders(user?: Pick<User, 'role'> | null): Promise<string[]> {
    const available: string[] = [];
    for (const [id, provider] of this.providers) {
      const flag = PROVIDER_FLAGS[id as keyof typeof PROVIDER_FLAGS];
      // A provider with no switch is never offered: every gateway is opt-out-able.
      if (!flag || !provider.isConfigured()) continue;
      if (!(await this.flags.isEnabled(flag))) continue;
      if (id === 'mock' && !this.mockAllowedFor(user)) continue;
      available.push(id);
    }
    return available;
  }

  async startCheckout(user: User, planKey: string, providerId: string): Promise<{ invoiceId: string; redirectUrl: string }> {
    const provider = this.providers.get(providerId);
    if (!provider || !(await this.availableProviders(user)).includes(providerId)) {
      throw new FeatureDisabledException(`${providerId}_checkout`);
    }

    const plan = await this.plans.findByKey(planKey);
    if (!plan.isActive || !plan.isPublic || plan.priceMinor <= 0 || plan.intervalDays <= 0) {
      throw new UpgradeRequiredException('That plan cannot be bought online.', { requiredTier: plan.tier });
    }

    const invoice = await this.prisma.invoice.create({
      data: {
        userId: user.id,
        planId: plan.id,
        provider: provider.id,
        amountMinor: plan.priceMinor,
        currency: plan.currency,
        periodDays: plan.intervalDays,
      },
    });

    const frontend = this.config.get<string>('app.frontendUrl', 'http://localhost:3000').replace(/\/$/, '');
    const apiPrefix = this.config.get<string>('app.apiPrefix', 'api/v1').replace(/^\/|\/$/g, '');

    try {
      const session = await provider.createCheckout({
        invoiceId: invoice.id,
        amountMinor: invoice.amountMinor,
        currency: invoice.currency,
        plan: { key: plan.key, name: plan.name },
        customer: { id: user.id, email: user.email, name: user.displayName ?? user.username },
        returnUrl: `${frontend}/account/invoices?invoice=${invoice.id}`,
        webhookUrl: `${frontend}/${apiPrefix}/billing/webhook/${provider.id}`,
      });
      if (session.providerRef) {
        await this.prisma.invoice.update({ where: { id: invoice.id }, data: { providerRef: session.providerRef } });
      }
      this.logger.log(`Invoice ${invoice.id}: ${provider.id} checkout for ${plan.key} by user ${user.id}`);
      return { invoiceId: invoice.id, redirectUrl: session.redirectUrl };
    } catch (error) {
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.FAILED, failureReason: 'Checkout could not be started' },
      });
      this.logger.error(`Invoice ${invoice.id}: ${provider.id} checkout failed: ${(error as Error).message}`);
      throw new BadRequestException('The payment page could not be opened. Please try again in a minute.');
    }
  }

  /**
   * Applies a verified provider event. Never throws for an event that is
   * merely stale or unknown (the provider would retry it forever); returns
   * IGNORED instead and logs why.
   */
  async settle(providerId: string, event: PaymentEvent): Promise<SettleResult> {
    const invoice = await this.findForEvent(providerId, event);
    if (!invoice) {
      this.logger.warn(`${providerId} event ${event.eventId} names no invoice we know; ignored`);
      return { invoiceId: null, status: 'IGNORED' };
    }

    if (event.outcome === 'PENDING') return { invoiceId: invoice.id, status: invoice.status };

    if (event.outcome === 'FAILED') {
      // A refund of a paid invoice is a support matter, not an automatic
      // downgrade: flag it and leave the subscription for the admin.
      if (invoice.status === InvoiceStatus.PAID) {
        await this.prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: InvoiceStatus.REFUNDED, failureReason: event.failureReason ?? 'Refunded or voided' },
        });
        this.logger.warn(`Invoice ${invoice.id} was refunded at ${providerId}; review the subscription by hand`);
        return { invoiceId: invoice.id, status: InvoiceStatus.REFUNDED };
      }
      await this.prisma.invoice.updateMany({
        where: { id: invoice.id, status: InvoiceStatus.PENDING },
        data: { status: InvoiceStatus.FAILED, failureReason: event.failureReason ?? 'Payment declined' },
      });
      return { invoiceId: invoice.id, status: InvoiceStatus.FAILED };
    }

    // PAID. The amount must be the one we asked for; a mismatch means a
    // tampered or misrouted payment, and it is never silently accepted.
    if (event.amountMinor !== invoice.amountMinor || (event.currency && event.currency.toUpperCase() !== invoice.currency.toUpperCase())) {
      this.logger.error(
        `Invoice ${invoice.id}: paid ${event.amountMinor} ${event.currency}, expected ${invoice.amountMinor} ${invoice.currency}; not granted`,
      );
      await this.prisma.invoice.updateMany({
        where: { id: invoice.id, status: InvoiceStatus.PENDING },
        data: { status: InvoiceStatus.FAILED, failureReason: 'Amount mismatch; held for review' },
      });
      return { invoiceId: invoice.id, status: InvoiceStatus.FAILED };
    }

    const claimed = await this.prisma.invoice.updateMany({
      // FAILED is claimable too: a customer can retry on the same order after
      // a decline, and the gateway reports the later success on it.
      where: { id: invoice.id, status: { in: [InvoiceStatus.PENDING, InvoiceStatus.FAILED] } },
      data: {
        status: InvoiceStatus.PAID,
        paidAt: new Date(),
        failureReason: null,
        providerRef: invoice.providerRef ?? event.providerRef,
      },
    });
    if (claimed.count === 0) return { invoiceId: invoice.id, status: invoice.status };

    try {
      await this.grantPeriod(invoice, event.eventId);
    } catch (error) {
      await this.prisma.invoice.update({ where: { id: invoice.id }, data: { status: invoice.status, paidAt: null } });
      throw error;
    }

    void this.notifications
      .dispatch({
        userId: invoice.userId,
        type: 'billing.payment_received',
        title: 'تم تفعيل اشتراكك',
        body: `استلمنا الدفع لخطة ${invoice.plan.name}. شكرًا لك!`,
        path: '/account/billing',
      })
      .catch((error: Error) => this.logger.warn(`Payment notice for ${invoice.userId} failed: ${error.message}`));

    return { invoiceId: invoice.id, status: InvoiceStatus.PAID };
  }

  async getMine(userId: string, invoiceId: string): Promise<InvoiceWithPlan> {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, userId }, include: { plan: true } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  /** Online invoices and wallet/InstaPay orders, newest first, in one list. */
  async listMine(userId: string, take = 50) {
    const [invoices, manual] = await Promise.all([
      this.prisma.invoice.findMany({ where: { userId }, include: { plan: true }, orderBy: { createdAt: 'desc' }, take }),
      this.prisma.manualPayment.findMany({ where: { userId }, include: { plan: true }, orderBy: { createdAt: 'desc' }, take }),
    ]);

    const rows = [
      ...invoices.map((invoice) => ({
        id: invoice.id,
        kind: 'online' as const,
        provider: invoice.provider,
        planKey: invoice.plan.key,
        planName: invoice.plan.name,
        amountMinor: invoice.amountMinor,
        currency: invoice.currency,
        status: invoice.status as string,
        createdAt: invoice.createdAt.toISOString(),
        paidAt: invoice.paidAt?.toISOString() ?? null,
        reference: invoice.providerRef,
      })),
      ...manual.map((payment) => ({
        id: payment.id,
        kind: 'manual' as const,
        provider: payment.method === 'INSTAPAY' ? 'instapay' : 'wallet',
        planKey: payment.plan.key,
        planName: payment.plan.name,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        // Same vocabulary as online invoices, so the page has one legend.
        status:
          payment.status === 'APPROVED'
            ? 'PAID'
            : payment.status === 'REJECTED'
              ? 'FAILED'
              : payment.status === 'CANCELLED'
                ? 'CANCELED'
                : 'PENDING',
        createdAt: payment.createdAt.toISOString(),
        paidAt: payment.status === 'APPROVED' ? (payment.reviewedAt?.toISOString() ?? null) : null,
        reference: payment.code,
      })),
    ];

    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, take);
  }

  /** Whether the test double may be used by this caller. */
  mockAllowedFor(user?: Pick<User, 'role'> | null): boolean {
    const production = this.config.get<string>('app.nodeEnv', process.env.NODE_ENV ?? 'development') === 'production';
    return !production || user?.role === UserRole.ADMIN;
  }

  /** The test page needs the invoice to belong to the caller and be a mock one. */
  async assertMockInvoice(user: User, invoiceId: string): Promise<InvoiceWithPlan> {
    const invoice = await this.getMine(user.id, invoiceId);
    if (invoice.provider !== 'mock' || !(await this.availableProviders(user)).includes('mock')) {
      throw new ForbiddenException('Not a test invoice');
    }
    return invoice;
  }

  private async findForEvent(providerId: string, event: PaymentEvent): Promise<InvoiceWithPlan | null> {
    if (event.invoiceId && /^[0-9a-f-]{36}$/i.test(event.invoiceId)) {
      const byId = await this.prisma.invoice.findFirst({
        where: { id: event.invoiceId, provider: providerId },
        include: { plan: true },
      });
      if (byId) return byId;
    }
    if (event.providerRef) {
      return this.prisma.invoice.findFirst({
        where: { provider: providerId, providerRef: event.providerRef },
        include: { plan: true },
      });
    }
    return null;
  }

  /**
   * Grants the paid period. Paying again before the current period of the
   * same plan ends adds a full period on top, so an early renewal loses no
   * days (the same rule as wallet payments).
   */
  private async grantPeriod(invoice: InvoiceWithPlan, eventId: string): Promise<void> {
    const now = new Date();
    const current = await this.subscriptions.getActiveForUser(invoice.userId);
    const extendsCurrent =
      current?.planId === invoice.planId &&
      current.status === SubscriptionStatus.ACTIVE &&
      current.currentPeriodEnd !== null &&
      current.currentPeriodEnd > now;
    const from = extendsCurrent && current?.currentPeriodEnd ? current.currentPeriodEnd : now;

    await this.subscriptions.grantPlan(invoice.userId, invoice.plan.key, {
      provider: invoice.provider,
      eventType: `${invoice.provider}_payment`,
      providerEventId: eventId,
      currentPeriodStart: extendsCurrent && current ? current.currentPeriodStart : now,
      currentPeriodEnd: new Date(from.getTime() + Math.max(invoice.periodDays, 1) * DAY_MS),
    });

    this.logger.log(`Invoice ${invoice.id} paid: ${invoice.plan.key} granted to user ${invoice.userId}`);
  }
}
