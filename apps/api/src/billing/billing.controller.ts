import { Body, Controller, Get, Logger, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User, UserRole } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { EntitlementsService } from './entitlements.service';
import { PlansService } from './plans.service';
import { StripeService } from './stripe.service';
import { SubscriptionsService } from './subscriptions.service';
import { AdminGrantPlanDto, CancelSubscriptionDto, CreateCheckoutDto } from './dto/billing.dto';
import { UpgradeRequiredException } from './billing.errors';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly plans: PlansService,
    private readonly subscriptions: SubscriptionsService,
    private readonly entitlements: EntitlementsService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
  ) {}

  /** Pricing page. Public on purpose. */
  @Public()
  @Get('plans')
  async listPlans() {
    return {
      plans: await this.plans.listPublic(),
      checkoutEnabled: this.stripe.isConfigured,
    };
  }

  /**
   * Everything the client needs to decide what to show: the resolved plan,
   * the limits, and live usage counts so the UI can render "7 of 10 tracked"
   * without a second round trip.
   */
  @Get('me')
  async getMyBilling(@CurrentUser() user: User) {
    const entitlements = await this.entitlements.getEntitlements(user.id);

    const usage = await this.entitlements.getUsage(user.id);

    return {
      ...entitlements,
      usage,
      checkoutEnabled: this.stripe.isConfigured,
    };
  }

  @Post('checkout')
  async createCheckout(@CurrentUser() user: User, @Body() dto: CreateCheckoutDto) {
    const plan = await this.plans.findByKey(dto.planKey);

    if (!plan.isActive || plan.priceMinor <= 0) {
      throw new UpgradeRequiredException('That plan cannot be purchased online.');
    }
    if (!plan.stripePriceId) {
      // Enterprise and any plan an operator has not wired to a Stripe Price.
      throw new UpgradeRequiredException(
        'This plan is sold directly. Contact sales to get set up.',
        { requiredTier: plan.tier },
      );
    }

    const existing = await this.subscriptions.getActiveForUser(user.id);
    const customerId = await this.stripe.findOrCreateCustomer({
      userId: user.id,
      email: user.email,
      name: user.displayName ?? user.username,
      existingCustomerId: existing?.providerCustomerId ?? null,
    });

    const frontend = this.config.get<string>('app.frontendUrl', 'http://localhost:3000').replace(/\/$/, '');

    const session = await this.stripe.createCheckoutSession({
      customerId,
      priceId: plan.stripePriceId,
      userId: user.id,
      planKey: plan.key,
      successUrl: `${frontend}${this.config.get<string>('billing.checkoutSuccessPath')}`,
      cancelUrl: `${frontend}${this.config.get<string>('billing.checkoutCancelPath')}`,
      trialDays: plan.trialDays,
    });

    this.logger.log(`Checkout session ${session.id} created for user ${user.id} on plan ${plan.key}`);
    return { url: session.url, sessionId: session.id };
  }

  /** Stripe-hosted billing portal: card updates, invoices, self-cancel. */
  @Post('portal')
  async createPortal(@CurrentUser() user: User) {
    const subscription = await this.subscriptions.getActiveForUser(user.id);
    if (!subscription?.providerCustomerId) {
      throw new UpgradeRequiredException('You do not have a billing account yet.');
    }

    const frontend = this.config.get<string>('app.frontendUrl', 'http://localhost:3000').replace(/\/$/, '');
    const url = await this.stripe.createPortalSession(
      subscription.providerCustomerId,
      `${frontend}${this.config.get<string>('billing.portalReturnPath')}`,
    );
    return { url };
  }

  @Post('cancel')
  async cancel(@CurrentUser() user: User, @Body() dto: CancelSubscriptionDto) {
    const subscription = await this.subscriptions.getActiveForUser(user.id);

    // Keep Stripe as the source of truth for Stripe-billed subscriptions —
    // cancelling only locally would leave the customer being charged.
    if (subscription?.provider === 'stripe' && subscription.providerSubscriptionId && !dto.immediately) {
      await this.stripe.cancelAtPeriodEnd(subscription.providerSubscriptionId);
    }

    const updated = await this.subscriptions.cancel(user.id, dto.immediately ?? false);
    return {
      status: updated.status,
      cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
      currentPeriodEnd: updated.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  // ─── Admin ──────────────────────────────────────────────────────────────

  /**
   * Hand-grant a plan. This is how enterprise contracts, comped accounts and
   * support fixes are done, and it is the reason the product is usable before
   * Stripe is configured at all.
   */
  @Roles(UserRole.ADMIN)
  @Post('admin/grant')
  async adminGrant(@CurrentUser() actor: User, @Body() dto: AdminGrantPlanDto) {
    const subscription = await this.subscriptions.adminGrantPlan(dto.userId, dto.planKey, dto.days);

    this.logger.log(`Admin ${actor.id} granted plan ${dto.planKey} to user ${dto.userId}`);
    return { id: subscription.id, status: subscription.status, planKey: dto.planKey };
  }

  @Roles(UserRole.ADMIN)
  @Get('admin/plans')
  adminListPlans() {
    return this.plans.listAll();
  }
}
