export type OrgType = 'SELLER' | 'BRAND';
export type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export type CompetitorEventType =
  | 'PRICE_DROP'
  | 'PRICE_INCREASE'
  | 'UNDERCUT'
  | 'OUT_OF_STOCK'
  | 'BACK_IN_STOCK'
  | 'NEW_ENTRANT'
  | 'UNUSUAL_MOVEMENT'
  | 'MAP_VIOLATION';

export type EventSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type PositionLabel =
  | 'CHEAPEST'
  | 'BELOW_MARKET'
  | 'AT_MARKET'
  | 'ABOVE_MARKET'
  | 'MOST_EXPENSIVE'
  | 'INSUFFICIENT_DATA';

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  type: OrgType;
  role: OrgRole;
  platform: { id: string; name: string; slug: string } | null;
  productCount: number;
  memberCount: number;
  createdAt: string;
}

export interface CompetitorPrice {
  platformId: string;
  platformName: string;
  price: number;
  inStock: boolean | null;
  url?: string;
}

export interface MarketPosition {
  ourPrice: number | null;
  lowest: number | null;
  highest: number | null;
  marketMedian: number | null;
  marketAverage: number | null;
  percentileRank: number | null;
  vsMedianPct: number | null;
  gapToCheapest: number | null;
  competitorCount: number;
  label: PositionLabel;
  explanation: string;
}

export interface PricingRecommendation {
  recommendedPrice: number | null;
  currentPrice: number | null;
  cost: number | null;
  floorPrice: number | null;
  targetPrice: number | null;
  projectedMarginPct: number | null;
  currentMarginPct: number | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  rationale: string[];
  caveat: string;
}

export interface SellerProductRow {
  id: string;
  sku: string;
  name: string;
  canonicalProductId: string | null;
  canonicalTitle: string | null;
  cost: number | null;
  currentPrice: number | null;
  targetMarginPct: number | null;
  minMarginPct: number | null;
  mapPrice: number | null;
  isActive: boolean;
  currency: string;
  position: MarketPosition;
  competitorCount: number;
}

export interface SellerProductDetail extends Omit<SellerProductRow, 'competitorCount'> {
  competitors: CompetitorPrice[];
  recommendation: PricingRecommendation;
}

export interface CompetitorEvent {
  id: string;
  type: CompetitorEventType;
  severity: EventSeverity;
  platform: { name: string; slug: string };
  sellerProduct: { id: string; sku: string; name: string } | null;
  canonicalProduct: { slug: string; title: string } | null;
  previousPrice: number | null;
  newPrice: number | null;
  ourPrice: number | null;
  changePct: number | null;
  evidence: Record<string, unknown>;
  detectedAt: string;
  acknowledgedAt: string | null;
}

export interface WorkspaceSummary {
  products: { total: number; mapped: number; unmapped: number };
  unacknowledgedEvents: number;
  last7Days: Partial<Record<CompetitorEventType, number>>;
  biggestDrops: Array<{
    id: string;
    product: string | null;
    platform: string;
    previousPrice: number | null;
    newPrice: number | null;
    changePct: number | null;
    detectedAt: string;
  }>;
}

export interface MatchSuggestion {
  id: string;
  title: string;
  slug: string;
  confidence: number;
}
