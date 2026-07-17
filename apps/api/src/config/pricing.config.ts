import { registerAs } from '@nestjs/config';

export default registerAs('pricing', () => ({
  // Every canonical product's `priceUsd` (despite the legacy name) is stored
  // normalized to THIS currency so listings from different-currency stores
  // (e.g. Carrefour UAE in AED, 2B Egypt in EGP) can be compared, sorted, and
  // merged into one price range instead of treating raw numbers from
  // different currencies as commensurable. EGP because every active store
  // ultimately serves the Egyptian market (see format.ts DEFAULT_CURRENCY).
  fxBaseCurrency: process.env.FX_BASE_CURRENCY ?? 'EGP',
  // Free, no-API-key-required FX endpoint. Fetched with base=USD and cross-rates
  // derived client-side (rate(X->base) = rates[base] / rates[X]) so one fetch
  // covers every currency a connector might emit, not just the base currency.
  fxRatesApiUrl: process.env.FX_RATES_API_URL ?? 'https://open.er-api.com/v6/latest/USD',
  fxRatesEnabled: (process.env.FX_RATES_ENABLED ?? 'true') !== 'false',
  // How long a fetched rate table is trusted before refetching. Long-lived on
  // purpose: FX rates move slowly and ingestion can persist hundreds of
  // listings per run, so this avoids a network round trip per listing.
  fxRatesCacheTtlMs: Number(process.env.FX_RATES_CACHE_TTL_MS ?? `${12 * 60 * 60 * 1000}`),
}));
