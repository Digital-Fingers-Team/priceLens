import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Subscription, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { EntitlementsService, ENTITLING_STATUSES } from './entitlements.service';
import { PlansService } from './plans.service';

export interface GrantOptions {
  provider?: string;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  status?: SubscriptionStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
  cancelAtPeriodEnd?: boolean;
  limitOverrides?: Prisma.InputJsonValue;
  /** For the audit trail + webhook idempotency. */
  providerEventId?: string | null;
  eventType?: string;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async getActiveForUser(userId: string): Promise<Subscription | null> {
    return this.prisma.subscription.findFirst({
      where: { userId, status: { in: ENTITLING_STATUSES } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Move a user onto a plan.
   *
   * Idempotent on `providerEventId`: replaying the same Stripe event is a
   * no-op rather than a second grant, because webhooks are at-least-once.
   * The whole thing runs in one transaction so a user can never be left with
   * the old subscription cancelled and the new one missing.
   */
  async grantPlan(userId: string, planKey: string, options: GrantOptions = {}): Promise<Subscription> {
    const plan = await this.plans.findByKey(planKey);
    if (!plan.isActive) {
      throw new BadRequestException(`Plan "${planKey}" is no longer available`);
    }

    const provider = options.provider ?? 'manual';

    if (options.providerEventId) {
      const seen = await this.prisma.subscriptionEvent.findUnique({
        where: {
          provider_providerEventId: { provider, providerEventId: options.providerEventId },
        },
      });
      if (seen) {
        this.logger.log(`Ignoring replayed ${provider} event ${options.providerEventId}`);
        const existing = await this.getActiveForUser(userId);
        if (existing) return existing;
      }
    }

    const periodStart = options.currentPeriodStart ?? new Date();
    const periodEnd =
      options.currentPeriodEnd !== undefined
        ? options.currentPeriodEnd
        : plan.intervalDays > 0
          ? new Date(periodStart.getTime() + plan.intervalDays * 24 * 60 * 60 * 1000)
          : null;

    const result = await this.prisma.$transaction(async (tx) => {
      const previous = await tx.subscription.findFirst({
        where: { userId, status: { in: ENTITLING_STATUSES } },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      });

      // Same plan, same provider subscription: this is a renewal, not a switch.
      if (
        previous &&
        previous.planId === plan.id &&
        (!options.providerSubscriptionId || previous.providerSubscriptionId === options.providerSubscriptionId)
      ) {
        const renewed = await tx.subscription.update({
          where: { id: previous.id },
          data: {
            status: options.status ?? SubscriptionStatus.ACTIVE,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: options.cancelAtPeriodEnd ?? false,
            canceledAt: null,
            trialEndsAt: options.trialEndsAt ?? previous.trialEndsAt,
            providerCustomerId: options.providerCustomerId ?? previous.providerCustomerId,
            providerSubscriptionId: options.providerSubscriptionId ?? previous.providerSubscriptionId,
            ...(options.limitOverrides !== undefined ? { limitOverrides: options.limitOverrides } : {}),
          },
        });

        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: renewed.id,
            userId,
            type: options.eventType ?? 'renewed',
            fromPlanKey: previous.plan.key,
            toPlanKey: plan.key,
            provider,
            providerEventId: options.providerEventId ?? null,
            payload: {} as Prisma.InputJsonValue,
          },
        });

        return renewed;
      }

      // Switching plans: retire the old row first so the partial unique index
      // (one live subscription per user) is never violated.
      if (previous) {
        await tx.subscription.update({
          where: { id: previous.id },
          data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date() },
        });
      }

      const created = await tx.subscription.create({
        data: {
          userId,
          planId: plan.id,
          status: options.status ?? SubscriptionStatus.ACTIVE,
          provider,
          providerCustomerId: options.providerCustomerId ?? null,
          providerSubscriptionId: options.providerSubscriptionId ?? null,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: options.cancelAtPeriodEnd ?? false,
          trialEndsAt: options.trialEndsAt ?? null,
          limitOverrides: options.limitOverrides ?? ({} as Prisma.InputJsonValue),
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: created.id,
          userId,
          type: options.eventType ?? (previous ? 'plan_changed' : 'created'),
          fromPlanKey: previous?.plan.key ?? null,
          toPlanKey: plan.key,
          provider,
          providerEventId: options.providerEventId ?? null,
          payload: {} as Prisma.InputJsonValue,
        },
      });

      return created;
    });

    await this.entitlements.invalidate(userId);
    this.logger.log(`User ${userId} is now on plan "${plan.key}" (${provider})`);
    return result;
  }

  /**
   * Cancel at period end by default -- the user keeps what they paid for
   * until the period runs out. `immediately` is for provider-driven
   * terminations (chargeback, deletion).
   */
  async cancel(userId: string, immediately = false): Promise<Subscription> {
    const subscription = await this.getActiveForUser(userId);
    if (!subscription) throw new NotFoundException('No active subscription to cancel');

    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: immediately
        ? { status: SubscriptionStatus.CANCELED, canceledAt: new Date(), cancelAtPeriodEnd: false }
        : { cancelAtPeriodEnd: true },
    });

    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        userId,
        type: immediately ? 'canceled' : 'cancel_scheduled',
        provider: subscription.provider,
        payload: {} as Prisma.InputJsonValue,
      },
    });

    await this.entitlements.invalidate(userId);
    return updated;
  }

  async markPastDue(subscriptionId: string, userId: string, providerEventId?: string): Promise<void> {
    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: SubscriptionStatus.PAST_DUE },
    });
    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId,
        userId,
        type: 'payment_failed',
        provider: 'stripe',
        providerEventId: providerEventId ?? null,
        payload: {} as Prisma.InputJsonValue,
      },
    });
    await this.entitlements.invalidate(userId);
  }

  /** The user behind a provider customer id, from their most recent subscription. */
  async findUserIdByProviderCustomer(providerCustomerId: string): Promise<string | null> {
    const existing = await this.prisma.subscription.findFirst({
      where: { providerCustomerId },
      select: { userId: true },
      orderBy: { createdAt: 'desc' },
    });
    return existing?.userId ?? null;
  }

  /**
   * An admin hand-grant (enterprise contracts, comped accounts, support
   * fixes): the plan from now, for `days` when given.
   */
  async adminGrantPlan(userId: string, planKey: string, days?: number): Promise<Subscription> {
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) throw new NotFoundException('User not found');

    const now = new Date();
    return this.grantPlan(userId, planKey, {
      provider: 'manual',
      eventType: 'manual_grant',
      currentPeriodStart: now,
      ...(days ? { currentPeriodEnd: new Date(now.getTime() + days * 86_400_000) } : {}),
    });
  }

  async findByProviderSubscriptionId(id: string): Promise<Subscription | null> {
    return this.prisma.subscription.findUnique({ where: { providerSubscriptionId: id } });
  }

  /**
   * Retire subscriptions whose paid period has elapsed.
   *
   * A safety net, not the primary path: normally the provider webhook renews
   * or cancels first. Without it a missed webhook would leave a lapsed user
   * entitled forever. EntitlementsService independently refuses to honour an
   * elapsed period, so this only reconciles stored state.
   */
  async expireLapsedSubscriptions(): Promise<number> {
    const now = new Date();
    const lapsed = await this.prisma.subscription.findMany({
      where: {
        status: { in: ENTITLING_STATUSES },
        currentPeriodEnd: { not: null, lt: now },
      },
      select: { id: true, userId: true },
      take: 500,
    });

    if (lapsed.length === 0) return 0;

    await this.prisma.subscription.updateMany({
      where: { id: { in: lapsed.map((s) => s.id) } },
      data: { status: SubscriptionStatus.EXPIRED },
    });

    await this.prisma.subscriptionEvent.createMany({
      data: lapsed.map((s) => ({
        subscriptionId: s.id,
        userId: s.userId,
        type: 'expired',
        provider: 'system',
      })),
    });

    await Promise.all(lapsed.map((s) => this.entitlements.invalidate(s.userId)));
    this.logger.log(`Expired ${lapsed.length} lapsed subscription(s)`);
    return lapsed.length;
  }
}
