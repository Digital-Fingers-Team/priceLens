import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * Thin wrapper over the Stripe SDK.
 *
 * Exists so that (a) the rest of the app never imports `stripe` directly and
 * a second provider can be added behind the same shape, and (b) an
 * unconfigured deployment degrades to a clear 503 on checkout instead of
 * throwing at module construction and taking the whole API down.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly client: Stripe | null;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('billing.stripeSecretKey', '');
    this.webhookSecret = this.config.get<string>('billing.stripeWebhookSecret', '');

    if (!secretKey) {
      this.client = null;
      this.logger.warn('STRIPE_SECRET_KEY is not set — self-serve checkout is disabled');
      return;
    }

    this.client = new Stripe(secretKey, {
      // Pinned: an unpinned version silently changes payload shapes under us.
      apiVersion: '2024-06-20',
      typescript: true,
      appInfo: { name: 'PriceLens', version: '1.0.0' },
      maxNetworkRetries: 2,
    });
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  get canVerifyWebhooks(): boolean {
    return this.client !== null && this.webhookSecret.length > 0;
  }

  private require(): Stripe {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Online payment is not configured on this deployment. Contact support to activate a plan.',
      );
    }
    return this.client;
  }

  /**
   * Reuse a customer per user so a returning subscriber does not accumulate
   * duplicate Stripe customers (which would split their billing history and
   * break the portal).
   */
  async findOrCreateCustomer(params: {
    userId: string;
    email: string;
    name?: string | null;
    existingCustomerId?: string | null;
  }): Promise<string> {
    const stripe = this.require();

    if (params.existingCustomerId) {
      try {
        const existing = await stripe.customers.retrieve(params.existingCustomerId);
        if (!existing.deleted) return existing.id;
      } catch (error) {
        this.logger.warn(
          `Stored Stripe customer ${params.existingCustomerId} could not be retrieved; creating a new one: ${(error as Error).message}`,
        );
      }
    }

    const customer = await stripe.customers.create({
      email: params.email,
      name: params.name ?? undefined,
      // The webhook resolves the local user from here, so it must always be set.
      metadata: { pricelensUserId: params.userId },
    });
    return customer.id;
  }

  async createCheckoutSession(params: {
    customerId: string;
    priceId: string;
    userId: string;
    planKey: string;
    successUrl: string;
    cancelUrl: string;
    trialDays?: number;
  }): Promise<{ id: string; url: string }> {
    const stripe = this.require();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: params.customerId,
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      // Carried on both the session and the subscription so every webhook
      // shape we handle can resolve back to a local user and plan.
      client_reference_id: params.userId,
      metadata: { pricelensUserId: params.userId, planKey: params.planKey },
      subscription_data: {
        metadata: { pricelensUserId: params.userId, planKey: params.planKey },
        ...(params.trialDays && params.trialDays > 0 ? { trial_period_days: params.trialDays } : {}),
      },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      throw new ServiceUnavailableException('Stripe did not return a checkout URL');
    }
    return { id: session.id, url: session.url };
  }

  async createPortalSession(customerId: string, returnUrl: string): Promise<string> {
    const stripe = this.require();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return session.url;
  }

  /**
   * Verify and parse a webhook.
   *
   * Refuses to process anything when no signing secret is configured: an
   * unverified webhook endpoint is an unauthenticated way to grant anyone a
   * paid plan, so "open by default" is not an option.
   */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const stripe = this.require();
    if (!this.webhookSecret) {
      throw new ServiceUnavailableException('STRIPE_WEBHOOK_SECRET is not configured');
    }
    return stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }

  async getSubscription(id: string): Promise<Stripe.Subscription> {
    return this.require().subscriptions.retrieve(id);
  }

  async cancelAtPeriodEnd(subscriptionId: string): Promise<void> {
    await this.require().subscriptions.update(subscriptionId, { cancel_at_period_end: true });
  }
}
