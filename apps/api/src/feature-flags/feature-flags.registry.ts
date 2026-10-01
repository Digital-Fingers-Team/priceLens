import { FEATURES, FeatureKey } from '../billing/plan-limits';

/**
 * Every feature switch, with the value it has when neither the database nor
 * the environment says otherwise.
 *
 * Two kinds live here:
 *   - plan features (FEATURES): a switched-off feature is gone for everyone,
 *     paying or not. A plan grant decides *who* may use a feature; the flag
 *     decides whether it exists at all.
 *   - operational switches that no plan sells (a payment provider, a job).
 *
 * A v2 feature starts with `defaultOn: false` and flips to true in the commit
 * that finishes it, so a half-built feature can never reach production by
 * accident. The admin can turn anything off again without a deploy.
 */
export const OPERATIONAL_FLAGS = {
  PAYMOB_CHECKOUT: 'paymob_checkout',
  MOCK_CHECKOUT: 'mock_checkout',
  ORG_INVITES: 'org_invites',
  PRICE_DAILY_ROLLUP: 'price_daily_rollup',
  RENEWAL_REMINDERS: 'renewal_reminders',
  LANDED_COST: 'landed_cost',
} as const;

export type OperationalFlag = (typeof OPERATIONAL_FLAGS)[keyof typeof OPERATIONAL_FLAGS];
export type FlagKey = FeatureKey | OperationalFlag;

export interface FlagDefinition {
  defaultOn: boolean;
  description: string;
}

/** Plan features that are built: on unless the admin turns them off. */
const SHIPPED: FeatureKey[] = [
  FEATURES.BUY_VERDICT,
  FEATURES.ADVANCED_DEAL_SCORE,
  FEATURES.FAKE_SALE_DETECTION,
  FEATURES.RESTOCK_ALERTS,
  FEATURES.DEAL_HUNTER,
  FEATURES.EXTENDED_HISTORY,
  FEATURES.AD_FREE,
  FEATURES.SELLER_WORKSPACE,
  FEATURES.COMPETITOR_MONITORING,
  FEATURES.COMPETITOR_ALERTS,
  FEATURES.MARGIN_PRICING,
  FEATURES.MARKET_POSITIONING,
  FEATURES.MAP_MONITORING,
  FEATURES.DISTRIBUTION_MONITORING,
  FEATURES.LAUNCH_DETECTION,
  FEATURES.MARKET_REPORTS,
  FEATURES.API_ACCESS,
  FEATURES.TEAM_SEATS,
  // v2, phase 2
  FEATURES.REALTIME_ALERTS,
  FEATURES.LANDED_COST_DETAIL,
];

const featureFlags = Object.fromEntries(
  Object.values(FEATURES).map((feature) => [
    feature,
    {
      defaultOn: SHIPPED.includes(feature),
      description: `Plan feature "${feature}"`,
    } satisfies FlagDefinition,
  ]),
) as Record<FeatureKey, FlagDefinition>;

export const FLAG_REGISTRY: Record<FlagKey, FlagDefinition> = {
  ...featureFlags,
  [OPERATIONAL_FLAGS.PAYMOB_CHECKOUT]: {
    defaultOn: true,
    description: 'Card / wallet / Fawry checkout through Paymob (also needs the PAYMOB_* keys)',
  },
  [OPERATIONAL_FLAGS.MOCK_CHECKOUT]: {
    defaultOn: false,
    description: 'Fake checkout that pays instantly. Development and test only; never turn on in production',
  },
  [OPERATIONAL_FLAGS.ORG_INVITES]: {
    defaultOn: true,
    description: 'Invite people to a workspace by email link, account or not',
  },
  [OPERATIONAL_FLAGS.PRICE_DAILY_ROLLUP]: {
    defaultOn: true,
    description: 'Nightly rollup of price history into one row per listing per day',
  },
  [OPERATIONAL_FLAGS.LANDED_COST]: {
    defaultOn: true,
    description: 'Cross-border offers priced at the door in Egypt (totals for everyone; the breakdown is landed_cost_detail)',
  },
  [OPERATIONAL_FLAGS.RENEWAL_REMINDERS]: {
    defaultOn: true,
    description: 'Remind people on a non-renewing plan (wallet, Paymob) three days before it ends',
  },
};

export function isFlagKey(value: string): value is FlagKey {
  return Object.prototype.hasOwnProperty.call(FLAG_REGISTRY, value);
}

/** FEATURE_<KEY>=true|false|1|0|on|off overrides the default. Anything else is ignored. */
export function envOverride(key: FlagKey, env: NodeJS.ProcessEnv = process.env): boolean | undefined {
  const raw = env[`FEATURE_${key.toUpperCase()}`]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return undefined;
  if (['true', '1', 'on', 'yes'].includes(raw)) return true;
  if (['false', '0', 'off', 'no'].includes(raw)) return false;
  return undefined;
}
