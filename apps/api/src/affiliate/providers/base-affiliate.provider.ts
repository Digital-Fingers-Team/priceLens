import { AffiliateLinkContext, AffiliateProvider } from '../interfaces';

/**
 * Shared plumbing for providers that generate a link by appending query
 * params directly onto the retailer's own URL (the common case). Providers
 * whose network instead wraps the destination in a redirector domain (see
 * JumiaAffiliateProvider) skip this base and implement buildAffiliateUrl
 * directly -- the interface, not this class, is the actual contract.
 */
export abstract class BaseAffiliateProvider implements AffiliateProvider {
  abstract readonly storeKey: string;

  buildAffiliateUrl(context: AffiliateLinkContext): string {
    const url = new URL(context.externalUrl);
    // Config-driven params first, store-specific ones last so a store's own
    // required params (its affiliate tag, its click-id field name) can never
    // be clobbered by an operator-entered tracking param of the same name.
    const params = { ...context.trackingParams, ...this.buildQueryParams(context) };
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  /** Store-specific query params (affiliate tag, click-id field, ...) to merge onto the destination URL. */
  protected abstract buildQueryParams(context: AffiliateLinkContext): Record<string, string>;
}
