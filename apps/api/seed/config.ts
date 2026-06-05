import type { SeedConfig, SeedProfile } from './types';

const PROFILE_DEFAULTS: Record<SeedProfile, Pick<SeedConfig,
  'productTarget' | 'listingsPerProduct' | 'challengeListingTarget' | 'historyRowsPerListing' | 'batchSize' | 'logInterval'
>> = {
  demo: {
    productTarget: 240,
    listingsPerProduct: 5,
    challengeListingTarget: 120,
    historyRowsPerListing: 35,
    batchSize: 1_000,
    logInterval: 5_000,
  },
  medium: {
    productTarget: 5_000,
    listingsPerProduct: 7,
    challengeListingTarget: 2_500,
    historyRowsPerListing: 60,
    batchSize: 5_000,
    logInterval: 25_000,
  },
  full: {
    productTarget: 51_000,
    listingsPerProduct: 10,
    challengeListingTarget: 20_000,
    historyRowsPerListing: 40,
    batchSize: 10_000,
    logInterval: 100_000,
  },
};

export function loadSeedConfig(env: NodeJS.ProcessEnv = process.env): SeedConfig {
  const profile = parseProfile(env.SEED_PROFILE);
  const defaults = PROFILE_DEFAULTS[profile];
  const historyRowsPerListing = positiveInt(env.SEED_HISTORY_TARGET, defaults.historyRowsPerListing);

  return {
    profile,
    seedVersion: 'marketplace-v1',
    seedNamespace: '7c34be4a-2a51-4a1d-b2c1-f7e6d916ca27',
    productTarget: positiveInt(env.SEED_PRODUCT_TARGET, defaults.productTarget),
    listingsPerProduct: positiveInt(env.SEED_LISTINGS_PER_PRODUCT, defaults.listingsPerProduct),
    challengeListingTarget: positiveInt(env.SEED_CHALLENGE_LISTINGS, defaults.challengeListingTarget),
    historyRowsPerListing,
    batchSize: positiveInt(env.SEED_BATCH_SIZE, defaults.batchSize),
    reset: env.SEED_RESET === 'true',
    resume: env.SEED_RESUME !== 'false',
    now: env.SEED_NOW ? new Date(env.SEED_NOW) : new Date(),
    logInterval: positiveInt(env.SEED_LOG_INTERVAL, defaults.logInterval),
  };
}

function parseProfile(value: string | undefined): SeedProfile {
  if (value === 'demo' || value === 'medium' || value === 'full') return value;
  return 'full';
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
