import { RetailerListing } from './retailer-listing.interface';

export interface RetailerConnector {
  readonly slug: string;
  readonly isEnabled: boolean;
  /**
   * Broad searches this store always answers, comma-separated, for the sweep's
   * health probe; STORE_PROBE_QUERY ("samsung,tv") when unset. A supermarket
   * sells neither and would be paused as blocked.
   */
  readonly probeQuery?: string;
  searchListings(query: string, limit: number): Promise<RetailerListing[]>;
}

