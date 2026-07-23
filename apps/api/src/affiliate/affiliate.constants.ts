/**
 * Injection token for the aggregated AffiliateProvider array (built by a
 * factory provider in AffiliateModule), so AffiliateProviderRegistry can
 * discover every store's provider without ever importing a concrete
 * provider class by name.
 */
export const AFFILIATE_PROVIDERS = Symbol('AFFILIATE_PROVIDERS');

/** Same idea as AFFILIATE_PROVIDERS, but for ConversionProvider (network conversion reporting). */
export const CONVERSION_PROVIDERS = Symbol('CONVERSION_PROVIDERS');

export const AFFILIATE_CONVERSION_QUEUE = 'affiliate-conversion';
export const RUN_CONVERSION_POLL_JOB = 'run-conversion-poll';
