/** GET /analytics/summary (apps/api/src/analytics/analytics.service.ts). */
export interface AnalyticsSummary {
  days: number;
  since: string;
  /** Distinct visitors at each step; store clickers are distinct hashed addresses (clicks carry no visitor id). */
  funnel?: {
    visitors: number;
    browsed: number;
    productViewers: number;
    storeClickers: number;
    signups: number;
  };
  traffic: {
    views: number;
    visitors: number;
    sessions: number;
    searches: number;
    avgViewMs: number;
    daily: Array<{ day: string; views: number; visitors: number }>;
    devices: Array<{ device: string; visitors: number }>;
    referrers: Array<{ host: string; sessions: number }>;
  };
  engagement: {
    routes: Array<{ route: string; views: number; totalMs: number; avgViewMs: number }>;
    products: Array<{
      slug: string;
      title: string;
      titleAr: string | null;
      views: number;
      visitors: number;
      totalMs: number;
      avgViewMs: number;
    }>;
    categories: Array<{ slug: string; name: string; views: number; totalMs: number }>;
  };
  searches: {
    top: Array<{ query: string; searches: number; visitors: number; avgResults: number | null }>;
    noResults: Array<{ query: string; searches: number }>;
  };
  products: { total: number; discovered: number; daily: Array<{ day: string; count: number }> };
  accounts: { total: number; new: number; active: number; daily: Array<{ day: string; count: number }> };
  favorites: {
    total: number;
    alerts: number;
    products: Array<{ slug: string; title: string; titleAr: string | null; count: number; new: number }>;
    alertProducts: Array<{ slug: string; title: string; titleAr: string | null; count: number }>;
  };
  storeClicks: {
    total: number;
    stores: Array<{ store: string; clicks: number }>;
    products: Array<{ slug: string; title: string; titleAr: string | null; count: number }>;
  };
}

export type AnalyticsDays = 1 | 7 | 30 | 90;
