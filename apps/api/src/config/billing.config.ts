import { registerAs } from '@nestjs/config';

export default registerAs('billing', () => ({
  // Billing is entirely optional. With no secret key the API still runs and
  // every entitlement path works -- only self-serve checkout is unavailable,
  // and it reports that honestly instead of failing obscurely at request time.
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  // Stripe settles in a real currency; EGP is supported for cards but the
  // Price objects are what actually define it, so this is only used for
  // one-off session creation and must match the Price.
  currency: (process.env.BILLING_CURRENCY ?? 'EGP').toLowerCase(),
  checkoutSuccessPath: process.env.BILLING_SUCCESS_PATH ?? '/account/billing?checkout=success',
  checkoutCancelPath: process.env.BILLING_CANCEL_PATH ?? '/pricing?checkout=cancelled',
  // Guard against a mis-set FRONTEND_URL sending customers to localhost.
  portalReturnPath: process.env.BILLING_PORTAL_RETURN_PATH ?? '/account/billing',
}));
