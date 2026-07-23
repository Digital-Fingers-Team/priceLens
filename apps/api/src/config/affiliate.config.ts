import { registerAs } from '@nestjs/config';

export default registerAs('affiliate', () => ({
  // Pepper mixed into the click-tracking IP hash so stored hashes can't be
  // rainbow-tabled back to real IPs by anyone with just DB access.
  ipHashSalt: process.env.AFFILIATE_IP_HASH_SALT ?? 'pricelens-affiliate-dev-salt',

  // ─── Conversion reconciliation ─────────────────────────────────────────
  conversionPollEnabled: process.env.AFFILIATE_CONVERSION_POLL_ENABLED !== 'false',
  conversionPollCron: process.env.AFFILIATE_CONVERSION_POLL_CRON ?? '0 */2 * * *',
  // Shared secret appended as a query param to the postback URL you register
  // with the network -- required for the inbound webhook route to accept a
  // conversion (see AffiliateConversionsController). Unset = webhook route
  // rejects everything, poll-only still works.
  conversionWebhookSecret: process.env.AFFILIATE_CONVERSION_WEBHOOK_SECRET ?? '',

  // ─── Impact.com (impact.com) Advertiser Actions API ─────────────────────
  // https://api.impact.com -- HTTP Basic auth with AccountSid as username,
  // AuthToken as password. Both blank = ImpactConversionProvider no-ops.
  impactAccountSid: process.env.IMPACT_ACCOUNT_SID ?? '',
  impactAuthToken: process.env.IMPACT_AUTH_TOKEN ?? '',
  impactBaseUrl: process.env.IMPACT_API_BASE_URL ?? 'https://api.impact.com',
}));
