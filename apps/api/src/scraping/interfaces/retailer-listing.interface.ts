export interface RetailerIdentifiers {
  gtin: string | null;
  upc: string | null;
  ean: string | null;
  mpn: string | null;
}

export interface RetailerListing {
  externalId: string;
  externalUrl: string;
  title: string;
  priceUsd: number | null;
  /**
   * The store's advertised "was" price, in the same currency as priceUsd.
   *
   * Only set when the store genuinely publishes a higher struck-through
   * price. Leaving it null means "no discount claimed", which is what
   * fake-discount detection needs in order to stay honest -- do not default
   * it to the live price.
   */
  advertisedPrice?: number | null;
  currency: string;
  brand: string | null;
  model: string | null;
  imageUrl: string | null;
  inStock: boolean | null;
  rating: number | null;
  reviewCount: number | null;
  identifiers: RetailerIdentifiers;
  raw: Record<string, unknown>;
}

