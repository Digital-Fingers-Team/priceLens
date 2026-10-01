import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Plan, PlanTier, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { DEFAULT_PLAN_BLUEPRINTS, PlanLimits, parsePlanLimits } from './plan-limits';

export interface PublicPlan {
  id: string;
  key: string;
  tier: PlanTier;
  name: string;
  description: string | null;
  priceMinor: number;
  /** Convenience for the UI: priceMinor / 100. */
  price: number;
  currency: string;
  intervalDays: number;
  trialDays: number;
  purchasable: boolean;
  limits: PlanLimits;
}

@Injectable()
export class PlansService implements OnModuleInit {
  private readonly logger = new Logger(PlansService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insert any blueprint plan that does not exist yet.
   *
   * Deliberately create-only: an operator who edits a price or a limit in the
   * database must not have it reverted by the next deploy. Removing a plan
   * from the blueprints likewise never deletes a row that subscriptions point
   * at -- deactivate it instead.
   */
  async onModuleInit(): Promise<void> {
    try {
      const existing = await this.prisma.plan.findMany({ select: { key: true } });
      const known = new Set(existing.map((plan) => plan.key));

      const missing = DEFAULT_PLAN_BLUEPRINTS.filter((blueprint) => !known.has(blueprint.key));
      if (missing.length === 0) return;

      await this.prisma.plan.createMany({
        data: missing.map((blueprint) => ({
          key: blueprint.key,
          tier: blueprint.tier,
          name: blueprint.name,
          description: blueprint.description,
          priceMinor: blueprint.priceMinor,
          currency: blueprint.currency,
          intervalDays: blueprint.intervalDays,
          trialDays: blueprint.trialDays,
          isPublic: blueprint.isPublic,
          sortOrder: blueprint.sortOrder,
          limits: blueprint.limits as unknown as Prisma.InputJsonValue,
        })),
        skipDuplicates: true,
      });

      this.logger.log(`Seeded ${missing.length} plan(s): ${missing.map((p) => p.key).join(', ')}`);
    } catch (error) {
      // A plan-seeding failure must not stop the API from booting -- the whole
      // catalogue and search product works without it, and EntitlementsService
      // already falls back to FREE_LIMITS when no plan row resolves.
      this.logger.error(`Plan seeding failed; continuing with existing plans: ${(error as Error).message}`);
    }
  }

  /** Plans shown on the pricing page. */
  async listPublic(): Promise<PublicPlan[]> {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true, isPublic: true },
      orderBy: { sortOrder: 'asc' },
    });
    return plans.map((plan) => this.toPublic(plan));
  }

  async listAll(): Promise<PublicPlan[]> {
    const plans = await this.prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } });
    return plans.map((plan) => this.toPublic(plan));
  }

  /** Everything the admin plan editor shows, inactive and hidden plans included. */
  async adminList() {
    const plans = await this.prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } });
    return plans.map((plan) => ({
      ...this.toPublic(plan),
      isActive: plan.isActive,
      isPublic: plan.isPublic,
      sortOrder: plan.sortOrder,
      stripePriceId: plan.stripePriceId,
      updatedAt: plan.updatedAt.toISOString(),
    }));
  }

  /**
   * Admin edit. Limits go through parsePlanLimits, so a malformed edit can
   * only ever make a plan *less* generous (unknown keys and bad values fall
   * back to the free tier), never hand out the paid product by accident.
   * Running subscriptions see the change within the entitlements cache TTL.
   */
  async adminUpdate(key: string, patch: AdminPlanPatch): Promise<Plan> {
    await this.findByKey(key);
    const data: Prisma.PlanUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.priceMinor !== undefined) data.priceMinor = patch.priceMinor;
    if (patch.intervalDays !== undefined) data.intervalDays = patch.intervalDays;
    if (patch.trialDays !== undefined) data.trialDays = patch.trialDays;
    if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
    if (patch.isActive !== undefined) data.isActive = patch.isActive;
    if (patch.isPublic !== undefined) data.isPublic = patch.isPublic;
    if (patch.limits !== undefined) data.limits = parsePlanLimits(patch.limits) as unknown as Prisma.InputJsonValue;

    const plan = await this.prisma.plan.update({ where: { key }, data });
    this.logger.log(`Plan ${key} edited: ${Object.keys(data).join(', ')}`);
    return plan;
  }

  async findByKey(key: string): Promise<Plan> {
    const plan = await this.prisma.plan.findUnique({ where: { key } });
    if (!plan) throw new NotFoundException(`Plan "${key}" not found`);
    return plan;
  }

  async findByStripePriceId(stripePriceId: string): Promise<Plan | null> {
    return this.prisma.plan.findUnique({ where: { stripePriceId } });
  }

  /** The plan a user falls back to with no subscription. */
  async getFreePlan(): Promise<Plan | null> {
    return this.prisma.plan.findFirst({
      where: { tier: PlanTier.FREE, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  toPublic(plan: Plan): PublicPlan {
    return {
      id: plan.id,
      key: plan.key,
      tier: plan.tier,
      name: plan.name,
      description: plan.description,
      priceMinor: plan.priceMinor,
      price: plan.priceMinor / 100,
      currency: plan.currency,
      intervalDays: plan.intervalDays,
      trialDays: plan.trialDays,
      // Self-serve checkout needs a Stripe price; enterprise is sold by hand.
      purchasable: plan.priceMinor > 0 && Boolean(plan.stripePriceId) && plan.isActive,
      limits: parsePlanLimits(plan.limits),
    };
  }
}

export interface AdminPlanPatch {
  name?: string;
  description?: string | null;
  priceMinor?: number;
  intervalDays?: number;
  trialDays?: number;
  sortOrder?: number;
  isActive?: boolean;
  isPublic?: boolean;
  limits?: unknown;
}
