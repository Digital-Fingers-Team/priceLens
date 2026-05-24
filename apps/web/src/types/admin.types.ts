import { MatchStatus, SourceListing, CanonicalProduct } from './product.types';

export interface ReviewQueueItem {
  id: string;
  sourceListingId: string;
  canonicalProductId: string | null;
  confidence: number;
  scores: MatchScores;
  priority: number;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolution: MatchStatus | null;
  notes: string | null;
  createdAt: string;
  sourceListing: SourceListing & {
    platform: { id: string; name: string; slug: string };
  };
  canonicalProduct: Pick<
    CanonicalProduct,
    'id' | 'title' | 'slug' | 'imageUrl' | 'brand'
  > | null;
}

export interface MatchScores {
  exactIdentifier: StepScore;
  brandModel: StepScore;
  fuzzyTitle: StepScore;
  semantic: StepScore;
  attributeConsistency: StepScore;
  priceSanity: StepScore;
  categoryConstraint: StepScore;
}

export interface StepScore {
  step: string;
  score: number;
  weight: number;
  matched: boolean;
  reason: string;
}

export interface DashboardStats {
  products: { total: number };
  listings: { total: number; accepted: number; rejected: number };
  review: { pending: number };
  users: { total: number };
  matchRate: string;
  recentJobs: RecentJob[];
}

export interface RecentJob {
  id: string;
  jobType: string;
  status: string;
  query: string | null;
  createdAt: string;
  completedAt: string | null;
  platform: { name: string };
}

export interface ResolveDecision {
  decision: 'ACCEPT' | 'REJECT';
  canonicalProductId?: string;
  notes?: string;
}