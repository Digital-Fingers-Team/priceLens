export type PlanTier = 'FREE' | 'PLUS' | 'SELLER' | 'ENTERPRISE';

export type SubscriptionStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'INCOMPLETE'
  | 'EXPIRED';

export type NotificationChannelType = 'IN_APP' | 'EMAIL' | 'TELEGRAM';

export type AlertType =
  | 'PRICE_TARGET'
  | 'PRICE_DROP_ABSOLUTE'
  | 'PRICE_DROP_PERCENT'
  | 'PRICE_INCREASE'
  | 'LOWEST_EVER'
  | 'RESTOCK'
  | 'MAJOR_DISCOUNT';

/** Mirrors PlanLimits in apps/api/src/billing/plan-limits.ts. */
export interface PlanLimits {
  /** null means unlimited — never treat it as zero. */
  trackedProducts: number | null;
  activeAlerts: number | null;
  priceHistoryDays: number | null;
  alertTypes: AlertType[];
  notificationChannels: NotificationChannelType[];
  features: string[];
  monitoredSkus: number | null;
  apiCallsPerDay: number;
  seats: number;
}

export interface Plan {
  id: string;
  key: string;
  tier: PlanTier;
  name: string;
  description: string | null;
  priceMinor: number;
  price: number;
  currency: string;
  intervalDays: number;
  trialDays: number;
  purchasable: boolean;
  limits: PlanLimits;
}

export interface Entitlements {
  planKey: string;
  planName: string;
  tier: PlanTier;
  limits: PlanLimits;
  status: SubscriptionStatus | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  usage: { trackedProducts: number; activeAlerts: number };
  checkoutEnabled: boolean;
}

/** Feature keys, mirroring FEATURES in the API. */
export const FEATURES = {
  BUY_VERDICT: 'buy_verdict',
  ADVANCED_DEAL_SCORE: 'advanced_deal_score',
  FAKE_SALE_DETECTION: 'fake_sale_detection',
  RESTOCK_ALERTS: 'restock_alerts',
  DEAL_HUNTER: 'deal_hunter',
  EXTENDED_HISTORY: 'extended_history',
  AD_FREE: 'ad_free',
  SELLER_WORKSPACE: 'seller_workspace',
  COMPETITOR_MONITORING: 'competitor_monitoring',
  COMPETITOR_ALERTS: 'competitor_alerts',
  MARGIN_PRICING: 'margin_pricing',
  MARKET_POSITIONING: 'market_positioning',
  MAP_MONITORING: 'map_monitoring',
  DISTRIBUTION_MONITORING: 'distribution_monitoring',
  LAUNCH_DETECTION: 'launch_detection',
  MARKET_REPORTS: 'market_reports',
  API_ACCESS: 'api_access',
  TEAM_SEATS: 'team_seats',
} as const;
