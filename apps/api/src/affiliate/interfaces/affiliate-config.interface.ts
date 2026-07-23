/** DB-backed affiliate settings for one store, as consumed by AffiliateService. */
export interface AffiliateConfigData {
  platformId: string;
  providerKey: string;
  affiliateId: string;
  trackingParams: Record<string, string>;
  isActive: boolean;
}
