/**
 * Multi-provider injection token: every AffiliateProvider registers itself
 * onto this token in AffiliateModule (`multi: true`), so
 * AffiliateProviderRegistry can discover all of them without ever importing
 * a concrete provider class by name.
 */
export const AFFILIATE_PROVIDERS = Symbol('AFFILIATE_PROVIDERS');
