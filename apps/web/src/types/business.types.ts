export interface MapViolationRow {
  eventId: string;
  sellerProductId: string;
  sku: string;
  productName: string;
  retailer: string;
  retailerSlug: string;
  mapPrice: number;
  advertisedPrice: number;
  differencePct: number;
  listingUrl: string | null;
  detectedAt: string;
  acknowledgedAt: string | null;
}

export interface AuthorizedRetailerRow {
  platformId: string;
  name: string;
  slug: string;
  kind: string;
  authorized: boolean;
  listings: number;
}

export interface AuthorizedRetailers {
  declared: boolean;
  retailers: AuthorizedRetailerRow[];
}

export interface UnauthorizedListing {
  retailer: string;
  retailerSlug: string;
  sku: string | null;
  productName: string;
  price: number;
  mapPrice: number | null;
  belowMap: boolean;
  listingUrl: string;
  lastSeenAt: string;
}

export interface ReportSummary {
  id: string;
  period: 'WEEKLY' | 'MONTHLY';
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
}

export interface ReportSection {
  key: string;
  title: string;
  rows: Array<Record<string, string | number | null>>;
  emptyNote: string;
}

export interface ReportDetail extends ReportSummary {
  payload: {
    currency: string;
    periodLabel: string;
    headline: Record<string, number>;
    sections: ReportSection[];
    dataNote: string;
  };
}

export interface QuoteOffer {
  store: string;
  storeSlug: string;
  storeKind: string;
  unitPrice: number;
  inStock: boolean | null;
  url: string;
}

export interface QuoteItem {
  id: string;
  query: string;
  specs: string | null;
  quantity: number;
  maxUnitPrice: number | null;
  overBudget: boolean;
  note: string | null;
  canonicalProductId: string | null;
  matchedTitle: string | null;
  store: string | null;
  storeKind: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
  inStock: boolean | null;
  listingUrl: string | null;
  alternatives: QuoteOffer[];
}

export interface Quote {
  id: string;
  title: string;
  notes: string | null;
  status: 'DRAFT' | 'FINAL';
  currency: string;
  total: number | null;
  pricedAt: string | null;
  createdAt: string;
  unpricedCount: number;
  items: QuoteItem[];
}

export interface QuoteSummary {
  id: string;
  title: string;
  status: 'DRAFT' | 'FINAL';
  itemCount: number;
  total: number | null;
  currency: string;
  createdAt: string;
}

export interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface IssuedApiKey {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
}

export interface ApiUsage {
  daily: Array<{ day: string; calls: number; errors: number }>;
  byEndpoint: Array<{ endpoint: string; calls: number }>;
}
