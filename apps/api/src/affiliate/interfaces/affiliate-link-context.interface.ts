/**
 * Everything an AffiliateProvider needs to turn a raw retailer product URL
 * into a trackable affiliate URL. Assembled by AffiliateService from the
 * clicked SourceListing plus that store's AffiliateConfig row.
 */
export interface AffiliateLinkContext {
  externalUrl: string;
  affiliateId: string;
  trackingParams: Record<string, string>;
  clickId: string;
}
