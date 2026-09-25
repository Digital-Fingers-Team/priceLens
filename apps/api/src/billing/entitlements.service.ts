import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { AlertType, PlanTier, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { FEATURES, FeatureKey, FREE_LIMITS, PlanLimits, isWithinLimit, parsePlanLimits } from './plan-limits';

/** Statuses that still grant access. PAST_DUE keeps access during dunning. */
export const ENTITLING_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
];

export interface Entitlements {
  planKey: string;
  planName: string;
  tier: PlanTier;
  limits: PlanLimits;
  status: SubscriptionStatus | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
}

const CACHE_PREFIX = 'entitlements:';
/**
 * Short on purpose. Entitlements are read on nearly every authenticated
 * request, but a stale grant is a real (if small) revenue and access bug, so
 * this trades a little DB load for a bounded window -- and every write path
 * calls invalidate() anyway.
 */
const CACHE_TTL_SECONDS = 60;

const FREE_ENTITLEMENTS: Entitlements = {
  planKey: 'free',
  planName: 'Free',
  tier: PlanTier.FREE,
  limits: FREE_LIMITS,
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  trialEndsAt: null,
};

/**
 * Resolves what a given user is allowed to do.
 *
 * Single source of truth for every gate in the app. Two rules hold everywhere:
 *   1. Failure is never a lockout -- any error degrades to the free tier.
 *   2. An expired period is not entitling even if the row still says ACTIVE,
 *      because provider webhooks can be late or lost.
 */
@Injectable()
export class EntitlementsService {
  private readonly logger = new Logger(EntitlementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async getEntitlements(userId: string | null | undefined): Promise<Entitlements> {
    if (!userId) return FREE_ENTITLEMENTS;

    const cacheKey = `${CACHE_PREFIX}${userId}`;
    try {
      const cached = await this.cache.get<Entitlements>(cacheKey);
      if (cached) return cached;
    } catch (error) {
      this.logger.warn(`Entitlement cache read failed for ${userId}: ${(error as Error).message}`);
    }

    const resolved = await this.resolve(userId);

    try {
      await this.cache.set(cacheKey, resolved, CACHE_TTL_SECONDS * 1000);
    } catch (error) {
      this.logger.warn(`Entitlement cache write failed for ${userId}: ${(error as Error).message}`);
    }

    return resolved;
  }

  /** Must be called by every path that changes a user's subscription. */
  async invalidate(userId: string): Promise<void> {
    try {
      await this.cache.del(`${CACHE_PREFIX}${userId}`);
    } catch (error) {
      this.logger.warn(`Entitlement cache invalidation failed for ${userId}: ${(error as Error).message}`);
    }
  }

  private async resolve(userId: string): Promise<Entitlements> {
    try {
      const subscription = await this.prisma.subscription.findFirst({
        where: { userId, status: { in: ENTITLING_STATUSES } },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      });

      if (!subscription) return FREE_ENTITLEMENTS;

      // A lost or delayed "subscription ended" webhook would otherwise leave a
      // lapsed customer entitled indefinitely. The period end is authoritative.
      const periodEnd = subscription.currentPeriodEnd;
      if (periodEnd && periodEnd.getTime() < Date.now()) {
        this.logger.warn(
          `Subscription ${subscription.id} is ${subscription.status} but its period ended at ` +
            `${periodEnd.toISOString()}; serving free-tier entitlements`,
        );
        return FREE_ENTITLEMENTS;
      }

      if (!subscription.plan.isActive) return FREE_ENTITLEMENTS;

      // Per-customer overrides win over the plan's published limits -- this is
      // how an enterprise deal gets a custom cap without a bespoke Plan row.
      const merged = {
        ...parsePlanLimits(subscription.plan.limits),
        ...this.pickOverrides(subscription.limitOverrides),
      };

      return {
        planKey: subscription.plan.key,
        planName: subscription.plan.name,
        tier: subscription.plan.tier,
        limits: merged,
        status: subscription.status,
        currentPeriodEnd: periodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      };
    } catch (error) {
      // Degrade, never lock out: a billing-table outage must not take down the
      // consumer product.
      this.logger.error(`Failed to resolve entitlements for ${userId}: ${(error as Error).message}`);
      return FREE_ENTITLEMENTS;
    }
  }

  /**
   * Overrides are operator-entered JSON. Only keys that are actually present
   * are taken, so `{}` (the default) changes nothing, and each is re-validated
   * through parsePlanLimits' coercion rules.
   */
  private pickOverrides(raw: unknown): Partial<PlanLimits> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const source = raw as Record<string, unknown>;
    if (Object.keys(source).length === 0) return {};

    const parsed = parsePlanLimits(source);
    const result: Partial<PlanLimits> = {};
    for (const key of Object.keys(source) as (keyof PlanLimits)[]) {
      if (key in parsed) {
        (result as Record<string, unknown>)[key] = parsed[key];
      }
    }
    return result;
  }

  // ─── Convenience predicates ────────────────────────────────────────────

  /** Live counts of what a user has used against their plan's limits. */
  async getUsage(userId: string): Promise<{ trackedProducts: number; activeAlerts: number }> {
    const [trackedProducts, activeAlerts] = await Promise.all([
      this.prisma.watchlistItem.count({ where: { userId } }),
      this.prisma.priceAlert.count({ where: { userId, status: 'ACTIVE' } }),
    ]);
    return { trackedProducts, activeAlerts };
  }

  async hasFeature(userId: string | null | undefined, feature: FeatureKey): Promise<boolean> {
    const { limits } = await this.getEntitlements(userId);
    return limits.features.includes(feature);
  }

  async canUseAlertType(userId: string, alertType: AlertType): Promise<boolean> {
    const { limits } = await this.getEntitlements(userId);
    return limits.alertTypes.includes(alertType);
  }

  /**
   * How far back this user may read price history.
   *
   * `requestedDays` is clamped rather than rejected: asking for 365 days on the
   * free plan returns 30 days of real data plus a truthful `truncated` flag,
   * which is a better funnel than an error.
   */
  async resolveHistoryWindow(
    userId: string | null | undefined,
    requestedDays: number,
  ): Promise<{ days: number; truncated: boolean; maxDays: number | null }> {
    const { limits } = await this.getEntitlements(userId);
    const max = limits.priceHistoryDays;
    const requested = Number.isFinite(requestedDays) && requestedDays > 0 ? Math.floor(requestedDays) : 90;

    if (max === null) return { days: requested, truncated: false, maxDays: null };
    return { days: Math.min(requested, max), truncated: requested > max, maxDays: max };
  }

  isWithinLimit = isWithinLimit;

  static readonly FEATURES = FEATURES;
}
