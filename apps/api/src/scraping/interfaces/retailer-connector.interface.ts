import { RetailerListing } from './retailer-listing.interface';

export interface RetailerConnector {
  readonly slug: string;
  readonly isEnabled: boolean;
  searchListings(query: string, limit: number): Promise<RetailerListing[]>;
}

