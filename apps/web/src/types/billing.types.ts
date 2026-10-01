export type PlanTier = 'FREE' | 'PLUS' | 'SELLER' | 'ENTERPRISE';

export type SubscriptionStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'INCOMPLETE'
  | 'EXPIRED';

export type NotificationChannelType = 'IN_APP' | 'EMAIL' | 'TELEGRAM' | 'WEB_PUSH';

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
  /** "wallet" plans do not renew by themselves. */
  provider: string | null;
  checkoutEnabled: boolean;
  manualPaymentsEnabled: boolean;
  /** Online gateways this user can pay with now ("paymob", "mock"). */
  onlineProviders: OnlineProvider[];
}

export interface PlansResponse {
  plans: Plan[];
  checkoutEnabled: boolean;
  manualPaymentsEnabled: boolean;
  onlineProviders: OnlineProvider[];
}

export type OnlineProvider = 'paymob' | 'mock';
export type InvoiceStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELED' | 'REFUNDED';

/** One row of /account/invoices: an online invoice or a wallet/InstaPay order. */
export interface InvoiceRow {
  id: string;
  kind: 'online' | 'manual';
  provider: string;
  planKey: string;
  planName: string;
  amountMinor: number;
  currency: string;
  status: InvoiceStatus;
  createdAt: string;
  paidAt: string | null;
  reference: string | null;
}

export interface InvoiceDetail {
  id: string;
  provider: string;
  planKey: string;
  planName: string;
  amountMinor: number;
  currency: string;
  status: InvoiceStatus;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
}

/** /billing/admin/plans: a plan with its admin-only fields. */
export interface AdminPlan extends Plan {
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
  stripePriceId: string | null;
  updatedAt: string;
}

export type AdminPlanPatch = Partial<
  Pick<AdminPlan, 'name' | 'description' | 'priceMinor' | 'intervalDays' | 'trialDays' | 'sortOrder' | 'isActive' | 'isPublic' | 'limits'>
>;

export interface FlagState {
  key: string;
  enabled: boolean;
  source: 'database' | 'environment' | 'default';
  description: string;
  defaultOn: boolean;
  updatedAt: string | null;
}

export type ManualPaymentStatus = 'AWAITING_PAYMENT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type ManualPaymentMethod = 'WALLET' | 'INSTAPAY';

/** A wallet / InstaPay order, confirmed by hand by the owner. */
export interface ManualPayment {
  id: string;
  code: string;
  status: ManualPaymentStatus;
  planKey: string;
  planName: string;
  tier: PlanTier;
  intervalDays: number;
  amountMinor: number;
  amount: number;
  currency: string;
  method: ManualPaymentMethod | null;
  reference: string | null;
  submittedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
}

export interface PaymentDestinations {
  walletNumber: string | null;
  instapayAddress: string | null;
  instapayLink: string | null;
}

export interface AdminManualPayment extends ManualPayment {
  payerAccount: string | null;
  reviewedAt: string | null;
  user: { id: string; email: string; username: string; displayName: string | null };
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
