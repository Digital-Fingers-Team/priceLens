/**
 * A gateway that takes one payment for one billing period.
 *
 * The same shape fits Paymob (cards, wallets, Fawry), a local test double,
 * and a Stripe one-off checkout. Stripe's native recurring subscriptions keep
 * their own flow (StripeService + StripeWebhookController); this interface is
 * for gateways where the customer pays per period and we grant the period.
 *
 * Rules every implementation keeps:
 *   - parseWebhook verifies the provider's signature and throws on a bad one;
 *     nothing in a webhook body is trusted before that.
 *   - The invoice id is round-tripped through the provider (merchant order id
 *     or equivalent), so the event names which invoice it settles.
 */
export interface PaymentProvider {
  /** Stored on invoices and subscriptions as `provider`. */
  readonly id: string;
  /** Has every key it needs. An unconfigured provider is never offered. */
  isConfigured(): boolean;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  parseWebhook(input: WebhookInput): PaymentEvent;
}

export interface CheckoutRequest {
  invoiceId: string;
  amountMinor: number;
  currency: string;
  plan: { key: string; name: string };
  customer: { id: string; email: string; name: string };
  /** Where the customer lands after paying (or giving up). */
  returnUrl: string;
  /** Where the provider posts the payment result. */
  webhookUrl: string;
}

export interface CheckoutSession {
  /** Send the customer here. */
  redirectUrl: string;
  /** The provider's id for this payment, when it gives one up front. */
  providerRef: string | null;
}

export interface WebhookInput {
  body: unknown;
  query: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
}

export type PaymentOutcome = 'PAID' | 'FAILED' | 'PENDING';

export interface PaymentEvent {
  /** Our invoice id, as round-tripped through the provider. Null if absent. */
  invoiceId: string | null;
  /** The provider's id for the payment (order id). */
  providerRef: string | null;
  /** Unique per event, for replay protection. */
  eventId: string;
  outcome: PaymentOutcome;
  amountMinor: number;
  currency: string;
  failureReason?: string;
}

/** Thrown for a webhook whose signature or shape does not check out. */
export class InvalidWebhookError extends Error {}

export const PAYMENT_PROVIDERS = Symbol('PAYMENT_PROVIDERS');
