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

