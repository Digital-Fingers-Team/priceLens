import { AffiliateLinkContext } from './affiliate-link-context.interface';

/**
 * Strategy interface for a single store's affiliate link generation logic.
 * Adding a new store never requires touching AffiliateService, the
 * controller, or the registry -- only a new class implementing this
 * interface, registered once in AffiliateModule (see AFFILIATE_PROVIDERS).
 */
export interface AffiliateProvider {
  /** Matches Platform.slug / AffiliateConfig.providerKey for this store. */
  readonly storeKey: string;

  buildAffiliateUrl(context: AffiliateLinkContext): string;
}
