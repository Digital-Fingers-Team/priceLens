import { AlertType, NotificationChannelType, PlanTier } from '@prisma/client';

/**
 * Every capability the product gates on, in one place.
 *
 * Adding a gate anywhere in the codebase means adding a member here first --
 * that is deliberate. Scattering ad-hoc `if (user.isPremium)` checks is how a
 * subscription product ends up with bypasses nobody can enumerate.
 */
export const FEATURES = {
  /** Buy/Wait verdict backed by real history. */
  BUY_VERDICT: 'buy_verdict',
  /** Multi-signal deal score with a published methodology breakdown. */
  ADVANCED_DEAL_SCORE: 'advanced_deal_score',
  /** "Was this 'discount' ever real?" check against recorded history. */
  FAKE_SALE_DETECTION: 'fake_sale_detection',
  /** Out-of-stock -> available notifications. */
  RESTOCK_ALERTS: 'restock_alerts',
  /** Natural-language constrained product search (Deal Hunter). */
  DEAL_HUNTER: 'deal_hunter',
  /** Full price history rather than a trailing window. */
  EXTENDED_HISTORY: 'extended_history',
  AD_FREE: 'ad_free',

  // ── B2B (stages 3-5) ──────────────────────────────────────────────────
  SELLER_WORKSPACE: 'seller_workspace',
  COMPETITOR_MONITORING: 'competitor_monitoring',
  COMPETITOR_ALERTS: 'competitor_alerts',
  MARGIN_PRICING: 'margin_pricing',
  MARKET_POSITIONING: 'market_positioning',

  // ── Enterprise (stages 7-14) ──────────────────────────────────────────
  MAP_MONITORING: 'map_monitoring',
  DISTRIBUTION_MONITORING: 'distribution_monitoring',
  LAUNCH_DETECTION: 'launch_detection',
  MARKET_REPORTS: 'market_reports',
  API_ACCESS: 'api_access',
  TEAM_SEATS: 'team_seats',
} as const;

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];

/**
 * A resolved entitlement set. A `null` numeric limit means unlimited; it never
 * means zero. Callers must use {@link isWithinLimit} rather than comparing
 * directly, so the null case cannot be fumbled into "no allowance".
 */
export interface PlanLimits {
  /** Max watchlist items. */
  trackedProducts: number | null;
  /** Max simultaneously ACTIVE price alerts. */
  activeAlerts: number | null;
  /** How far back price history may be read, in days. null = all we hold. */
  priceHistoryDays: number | null;
  /** Alert types this plan may create. */
  alertTypes: AlertType[];
  /** Delivery channels this plan may configure. */
  notificationChannels: NotificationChannelType[];
  /** Feature flags. */
  features: FeatureKey[];
  /** Monitored SKUs for seller/brand workspaces (stages 3+). */
  monitoredSkus: number | null;
  /** Enterprise API calls per day. 0 = no API access. */
  apiCallsPerDay: number;
  /** Seats for team accounts. */
  seats: number;
}

/** The free tier's alert types: enough to be genuinely useful as a funnel. */
const FREE_ALERT_TYPES: AlertType[] = [AlertType.PRICE_TARGET, AlertType.PRICE_DROP_PERCENT];

const ALL_ALERT_TYPES: AlertType[] = [
  AlertType.PRICE_TARGET,
  AlertType.PRICE_DROP_ABSOLUTE,
  AlertType.PRICE_DROP_PERCENT,
  AlertType.PRICE_INCREASE,
  AlertType.LOWEST_EVER,
  AlertType.RESTOCK,
  AlertType.MAJOR_DISCOUNT,
];

const PLUS_FEATURES: FeatureKey[] = [
  FEATURES.BUY_VERDICT,
  FEATURES.ADVANCED_DEAL_SCORE,
  FEATURES.FAKE_SALE_DETECTION,
  FEATURES.RESTOCK_ALERTS,
  FEATURES.DEAL_HUNTER,
  FEATURES.EXTENDED_HISTORY,
  FEATURES.AD_FREE,
];

const SELLER_FEATURES: FeatureKey[] = [
  ...PLUS_FEATURES,
  FEATURES.SELLER_WORKSPACE,
  FEATURES.COMPETITOR_MONITORING,
  FEATURES.COMPETITOR_ALERTS,
  FEATURES.MARGIN_PRICING,
  FEATURES.MARKET_POSITIONING,
];

const ENTERPRISE_FEATURES: FeatureKey[] = [
  ...SELLER_FEATURES,
  FEATURES.MAP_MONITORING,
  FEATURES.DISTRIBUTION_MONITORING,
  FEATURES.LAUNCH_DETECTION,
  FEATURES.MARKET_REPORTS,
  FEATURES.API_ACCESS,
  FEATURES.TEAM_SEATS,
];

/**
 * What an unauthenticated visitor or a user with no subscription row gets.
 *
 * This is also the hard floor used when the database is unreachable, so it is
 * intentionally conservative but never zero -- a billing outage must degrade
 * paying users to the free product, not lock them out of the site.
 */
export const FREE_LIMITS: PlanLimits = {
  trackedProducts: 10,
  activeAlerts: 3,
  priceHistoryDays: 30,
  alertTypes: FREE_ALERT_TYPES,
  notificationChannels: [NotificationChannelType.IN_APP, NotificationChannelType.EMAIL],
  features: [],
  monitoredSkus: 0,
  apiCallsPerDay: 0,
  seats: 1,
};

/**
 * Seed values for the `plans` table.
 *
 * These are *defaults written once on first boot*, not runtime constants:
 * PlansService only inserts a blueprint whose `key` is missing, so editing a
 * price or a limit in the database is permanent and survives deploys. The EGP
 * figures follow the brief's ranges and are expected to change.
 */
export interface PlanBlueprint {
  key: string;
  tier: PlanTier;
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  intervalDays: number;
  sortOrder: number;
  trialDays: number;
  isPublic: boolean;
  limits: PlanLimits;
}

export const DEFAULT_PLAN_BLUEPRINTS: PlanBlueprint[] = [
  {
    key: 'free',
    tier: PlanTier.FREE,
    name: 'Free',
    description: 'Compare prices, track a handful of products, and get basic alerts.',
    priceMinor: 0,
    currency: 'EGP',
    intervalDays: 0,
    sortOrder: 0,
    trialDays: 0,
    isPublic: true,
    limits: FREE_LIMITS,
  },
  {
    key: 'plus_monthly',
    tier: PlanTier.PLUS,
    name: 'PriceLens Plus',
    description: 'Know when to buy. Unlimited tracking, every alert type, and full buying intelligence.',
    priceMinor: 12_900, // 129.00 EGP
    currency: 'EGP',
    intervalDays: 30,
    sortOrder: 1,
    trialDays: 7,
    isPublic: true,
    limits: {
      trackedProducts: 500,
      activeAlerts: null,
      priceHistoryDays: null,
      alertTypes: ALL_ALERT_TYPES,
      notificationChannels: [
        NotificationChannelType.IN_APP,
        NotificationChannelType.EMAIL,
        NotificationChannelType.TELEGRAM,
      ],
      features: PLUS_FEATURES,
      monitoredSkus: 0,
      apiCallsPerDay: 0,
      seats: 1,
    },
  },
  {
    key: 'seller_monthly',
    tier: PlanTier.SELLER,
    name: 'Seller',
    description: 'Watch your competitors, hold your price position, and price with your margin in view.',
    priceMinor: 99_900, // 999.00 EGP
    currency: 'EGP',
    intervalDays: 30,
    sortOrder: 2,
    trialDays: 14,
    isPublic: true,
    limits: {
      trackedProducts: null,
      activeAlerts: null,
      priceHistoryDays: null,
      alertTypes: ALL_ALERT_TYPES,
      notificationChannels: [
        NotificationChannelType.IN_APP,
        NotificationChannelType.EMAIL,
        NotificationChannelType.TELEGRAM,
      ],
      features: SELLER_FEATURES,
      monitoredSkus: 500,
      apiCallsPerDay: 0,
      seats: 3,
    },
  },
  {
    key: 'enterprise_monthly',
    tier: PlanTier.ENTERPRISE,
    name: 'Enterprise',
    description: 'Market-wide intelligence: MAP enforcement, distribution coverage, reports and API access.',
    priceMinor: 1_500_000, // 15,000.00 EGP — contract pricing; a starting point
    currency: 'EGP',
    intervalDays: 30,
    sortOrder: 3,
    trialDays: 0,
    // Enterprise is sold, not self-served: it is not offered through Checkout.
    isPublic: false,
    limits: {
      trackedProducts: null,
      activeAlerts: null,
      priceHistoryDays: null,
      alertTypes: ALL_ALERT_TYPES,
      notificationChannels: [
        NotificationChannelType.IN_APP,
        NotificationChannelType.EMAIL,
        NotificationChannelType.TELEGRAM,
      ],
      features: ENTERPRISE_FEATURES,
      monitoredSkus: null,
      apiCallsPerDay: 50_000,
      seats: 25,
    },
  },
];

/** `null` means unlimited, so a bare `count < limit` would be wrong. */
export function isWithinLimit(currentCount: number, limit: number | null): boolean {
  if (limit === null) return true;
  return currentCount < limit;
}

/**
 * Coerces a `limits` JSON blob from the database back into a PlanLimits.
 *
 * Plan rows are operator-editable, so this must tolerate partial, stale, or
 * hand-edited JSON: anything missing or malformed falls back to the free-tier
 * value rather than to `undefined`, which would read as "unlimited" at the
 * call site and silently hand out the paid product.
 */
export function parsePlanLimits(raw: unknown): PlanLimits {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const num = (key: keyof PlanLimits, fallback: number | null): number | null => {
    const value = source[key];
    if (value === null) return null;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
    return fallback;
  };

  const list = <T extends string>(key: keyof PlanLimits, allowed: readonly T[], fallback: T[]): T[] => {
    const value = source[key];
    if (!Array.isArray(value)) return fallback;
    const filtered = value.filter((entry): entry is T => typeof entry === 'string' && (allowed as readonly string[]).includes(entry));
    return filtered;
  };

  const apiCalls = num('apiCallsPerDay', 0);
  const seats = num('seats', 1);

  return {
    trackedProducts: num('trackedProducts', FREE_LIMITS.trackedProducts),
    activeAlerts: num('activeAlerts', FREE_LIMITS.activeAlerts),
    priceHistoryDays: num('priceHistoryDays', FREE_LIMITS.priceHistoryDays),
    alertTypes: list('alertTypes', ALL_ALERT_TYPES, FREE_ALERT_TYPES),
    notificationChannels: list(
      'notificationChannels',
      Object.values(NotificationChannelType),
      FREE_LIMITS.notificationChannels,
    ),
    features: list('features', Object.values(FEATURES), []),
    monitoredSkus: num('monitoredSkus', 0),
    // Unlimited is meaningless for a rate limit; treat null as "none".
    apiCallsPerDay: apiCalls ?? 0,
    seats: seats ?? 1,
  };
}
