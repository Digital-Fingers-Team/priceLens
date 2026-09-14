import { BadRequestException, Controller, Headers, Logger, Post, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { SubscriptionStatus } from '@prisma/client';
import { Public } from '../common/decorators';
import { PrismaService } from '../database/prisma.service';
import { PlansService } from './plans.service';
import { StripeService } from './stripe.service';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Stripe's webhook endpoint.
 *
 * @Public because Stripe cannot present a JWT — authentication here is the
 * signature check in StripeService.constructEvent, which is mandatory and
 * fails closed. @SkipThrottle because a burst of legitimate events during a
 * retry storm must not be rate-limited into being dropped.
 *
 * Requires `rawBody: true` on the Nest app (see main.ts): the signature is
 * computed over the exact bytes, so a JSON-parsed body cannot verify.
 */
@ApiExcludeController()
@Controller('billing/webhook')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripe: StripeService,
    private readonly subscriptions: SubscriptionsService,
    private readonly plans: PlansService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @SkipThrottle()
  @Post('stripe')
  async handleStripe(@Req() request: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    if (!signature) throw new BadRequestException('Missing stripe-signature header');
    if (!request.rawBody) {
      // Fail loudly: silently accepting would mean an unverifiable webhook.
      throw new BadRequestException('Raw request body unavailable; webhook cannot be verified');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.constructEvent(request.rawBody, signature);
    } catch (error) {
      this.logger.warn(`Rejected Stripe webhook: ${(error as Error).message}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    try {
      await this.dispatch(event);
    } catch (error) {
      // Returning 5xx makes Stripe retry, which is what we want for a
      // transient failure — but log loudly so a persistent one is visible.
      this.logger.error(`Failed handling Stripe event ${event.id} (${event.type}): ${(error as Error).message}`);
      throw error;
    }

    return { received: true };
  }

  private async dispatch(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') return;
        await this.applySubscription(
          typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
          event.id,
          session.client_reference_id ?? session.metadata?.pricelensUserId ?? null,
        );
        return;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'invoice.payment_succeeded': {
        const subscriptionId =
          event.type === 'invoice.payment_succeeded'
            ? this.subscriptionIdFromInvoice(event.data.object as Stripe.Invoice)
            : (event.data.object as Stripe.Subscription).id;
        if (!subscriptionId) return;
        await this.applySubscription(subscriptionId, event.id, null);
        return;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const local = await this.subscriptions.findByProviderSubscriptionId(subscription.id);
        if (!local) return;
        await this.subscriptions.cancel(local.userId, true);
        this.logger.log(`Stripe subscription ${subscription.id} deleted; revoked plan for user ${local.userId}`);
        return;
      }

      case 'invoice.payment_failed': {
        const subscriptionId = this.subscriptionIdFromInvoice(event.data.object as Stripe.Invoice);
        if (!subscriptionId) return;
        const local = await this.subscriptions.findByProviderSubscriptionId(subscriptionId);
        if (!local) return;
        // PAST_DUE still entitles: dunning, not instant revocation.
        await this.subscriptions.markPastDue(local.id, local.userId, event.id);
        return;
      }

      default:
        this.logger.debug(`Ignoring unhandled Stripe event type ${event.type}`);
    }
  }

  /**
   * Re-reads the subscription from Stripe rather than trusting the event
   * payload. Events can arrive out of order, and the live object is always
   * the correct current state.
   */
  private async applySubscription(
    stripeSubscriptionId: string | undefined,
    eventId: string,
    fallbackUserId: string | null,
  ): Promise<void> {
    if (!stripeSubscriptionId) return;

    const subscription = await this.stripe.getSubscription(stripeSubscriptionId);
    const userId = await this.resolveUserId(subscription, fallbackUserId);
    if (!userId) {
      this.logger.error(
        `Stripe subscription ${stripeSubscriptionId} has no resolvable PriceLens user; ignoring`,
      );
      return;
    }

    const priceId = subscription.items.data[0]?.price?.id;
    const plan = priceId ? await this.plans.findByStripePriceId(priceId) : null;
    const planKey = plan?.key ?? subscription.metadata?.planKey;

    if (!planKey) {
      this.logger.error(
        `Stripe price ${priceId ?? '<none>'} does not map to any PriceLens plan; ignoring subscription ${stripeSubscriptionId}`,
      );
      return;
    }

    await this.subscriptions.grantPlan(userId, planKey, {
      provider: 'stripe',
      providerEventId: eventId,
      providerSubscriptionId: subscription.id,
      providerCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
      status: this.mapStatus(subscription.status),
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      eventType: 'stripe_sync',
    });
  }

  private async resolveUserId(subscription: Stripe.Subscription, fallback: string | null): Promise<string | null> {
    const fromMetadata = subscription.metadata?.pricelensUserId;
    if (fromMetadata) return fromMetadata;
    if (fallback) return fallback;

    // Last resort: a prior subscription for the same Stripe customer.
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const existing = await this.prisma.subscription.findFirst({
      where: { providerCustomerId: customerId },
      select: { userId: true },
      orderBy: { createdAt: 'desc' },
    });
    return existing?.userId ?? null;
  }

  private subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | undefined {
    const subscription = (invoice as unknown as { subscription?: string | { id: string } }).subscription;
    if (!subscription) return undefined;
    return typeof subscription === 'string' ? subscription : subscription.id;
  }

  private mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
    switch (status) {
      case 'trialing':
        return SubscriptionStatus.TRIALING;
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'past_due':
      case 'unpaid':
        return SubscriptionStatus.PAST_DUE;
      case 'canceled':
        return SubscriptionStatus.CANCELED;
      case 'incomplete':
      case 'incomplete_expired':
        return SubscriptionStatus.INCOMPLETE;
      default:
        return SubscriptionStatus.ACTIVE;
    }
  }
}
