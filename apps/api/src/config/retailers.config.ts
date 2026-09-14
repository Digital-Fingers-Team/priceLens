import * as path from 'path';
import { registerAs } from '@nestjs/config';

export default registerAs('retailers', () => ({
  liveIngestionLimit: parseInt(process.env.LIVE_INGESTION_LIMIT ?? '25', 10),
  liveIngestionScheduleEnabled: process.env.LIVE_INGESTION_SCHEDULE_ENABLED !== 'false',
  liveIngestionCron: process.env.LIVE_INGESTION_CRON ?? '0 */6 * * *',
  // After the generic category sweep discovers a product on one store, re-query
  // the OTHER stores with a specific "brand model storage" query so they return
  // the SAME product and it gets merged onto one canonical (fixes products that
  // only ever show "1 store" because each store's generic search returns a
  // different set of products). Bounded per run to keep scrape volume sane.
  crossStoreBackfillEnabled: process.env.CROSS_STORE_BACKFILL_ENABLED !== 'false',
  crossStoreBackfillMaxProducts: parseInt(process.env.CROSS_STORE_BACKFILL_MAX_PRODUCTS ?? '40', 10),
  crossStoreBackfillLimitPerQuery: parseInt(process.env.CROSS_STORE_BACKFILL_LIMIT_PER_QUERY ?? '5', 10),
  // Target number of distinct stores every product should be compared across.
  // When a product detail is viewed and it's covered by fewer priced stores than
  // this, a background job searches the remaining stores by the product's specs
  // to try to reach it.
  //
  // This is a *wish*, not a reachable goal: it is clamped at runtime to the
  // number of connectors actually enabled (see resolveCoverageTarget). Setting
  // it above that count previously made the coverage sweep's exit condition
  // unsatisfiable, so every product stayed permanently "under-covered" and the
  // sweep re-scraped the whole catalog on every run, forever.
  minStoresPerProduct: parseInt(process.env.MIN_STORES_PER_PRODUCT ?? '4', 10),
  // Reactive expansion (above) only fires for products someone actually browses
  // to (product detail page, or now a search hit). This periodic sweep catches
  // the rest of the catalog -- products under minStoresPerProduct that nobody
  // has viewed recently -- so coverage still improves in the background.
  storeCoverageSweepEnabled: process.env.STORE_COVERAGE_SWEEP_ENABLED !== 'false',
  // Concurrency is 1, but that bounds only *simultaneous* load -- not total
  // work. Each product costs one real-browser search per missing store, so a
  // batch of N takes roughly N x (stores x seconds) of wall clock. At 500+ on
  // a */45 cron the sweep could not finish inside its own interval, so runs
  // overlapped and Chromium never went idle. Keep batch x interval such that a
  // run comfortably completes before the next one is due; runStoreCoverageSweep
  // also refuses to start while one is already in flight.
  storeCoverageSweepCron: process.env.STORE_COVERAGE_SWEEP_CRON ?? '0 */6 * * *',

  // Alerts are cheap to evaluate and users expect them promptly, so they run
  // far more often than the scraping sweeps. (Previously this key was read by
  // the scheduler but never declared here, so the env var was silently inert.)
  priceAlertCron: process.env.PRICE_ALERT_CRON ?? '*/30 * * * *',
  // Retries transiently-failed notification deliveries.
  notificationRetryCron: process.env.NOTIFICATION_RETRY_CRON ?? '*/15 * * * *',
  // Expires subscriptions whose period elapsed without a renewal webhook.
  subscriptionMaintenanceCron: process.env.SUBSCRIPTION_MAINTENANCE_CRON ?? '17 * * * *',
  storeCoverageSweepBatchSize: parseInt(process.env.STORE_COVERAGE_SWEEP_BATCH_SIZE ?? '100', 10),
  // How long to leave a product alone after the sweep has tried to expand it.
  // Without this, any product that cannot reach the target -- because no other
  // store carries it -- is re-scraped on every run for as long as it exists.
  storeCoverageRetryCooldownHours: parseInt(
    process.env.STORE_COVERAGE_RETRY_COOLDOWN_HOURS ?? '168',
    10,
  ),
  // A connector that keeps failing (CAPTCHA wall, blocked, markup changed) costs
  // a full browser page load per attempt and returns nothing. After this many
  // consecutive failures it is skipped until the cooldown expires, instead of
  // being retried for every product in the batch.
  connectorFailureThreshold: parseInt(process.env.CONNECTOR_FAILURE_THRESHOLD ?? '5', 10),
  connectorCooldownMinutes: parseInt(process.env.CONNECTOR_COOLDOWN_MINUTES ?? '30', 10),
  amazonEnabled: process.env.AMAZON_ENABLED !== 'false',
  // Egypt storefront -- amazon.com doesn't carry OPPO phones (and most of the
  // catalog this app cares about) at all; confirmed live that amazon.eg does,
  // with genuine EGP prices. See amazon.connector.ts.
  amazonBaseUrl: process.env.AMAZON_BASE_URL ?? 'https://www.amazon.eg',
  alibabaEnabled: process.env.ALIBABA_ENABLED !== 'false',
  alibabaBaseUrl: process.env.ALIBABA_BASE_URL ?? 'https://www.alibaba.com',
  // Unlike Alibaba, AliExpress does not serve a CAPTCHA to the real-Chrome +
  // persistent-profile setup (see AliExpressConnector) — same browser
  // approach as Noon, no login required.
  aliexpressEnabled: process.env.ALIEXPRESS_ENABLED !== 'false',
  aliexpressBaseUrl: process.env.ALIEXPRESS_BASE_URL ?? 'https://www.aliexpress.com',
  noonEnabled: process.env.NOON_ENABLED !== 'false',
  noonBaseUrl: process.env.NOON_BASE_URL ?? 'https://www.noon.com',
  // Noon sits behind Akamai Bot Manager: plain HTTP requests get an empty
  // bot-shell response, so this connector drives a real installed Chrome
  // (not Playwright's bundled Chromium) through a persistent, logged-in
  // profile instead of parsing HTML. Run `npm run login:noon` once per
  // profile dir to establish the session before enabling this connector.
  // On a headless Linux server, run Chrome non-headless under Xvfb rather
  // than setting browserHeadless=true — real headless mode gets blocked too.
  browserProfileDir: process.env.BROWSER_PROFILE_DIR ?? path.join(process.cwd(), '.browser-profiles'),
  browserHeadless: process.env.BROWSER_HEADLESS === 'true',
  jumiaEnabled: process.env.JUMIA_ENABLED !== 'false',
  jumiaBaseUrl: process.env.JUMIA_BASE_URL ?? 'https://www.jumia.com.eg',
  carrefourEnabled: process.env.CARREFOUR_ENABLED !== 'false',
  // Egypt storefront (not UAE) so listings are genuine local EGP retail prices
  // rather than a UAE price needing FX conversion -- see carrefour.connector.ts.
  carrefourBaseUrl: process.env.CARREFOUR_BASE_URL ?? 'https://www.carrefouregypt.com',
  twoBEnabled: process.env.TWOB_ENABLED !== 'false',
  twoBBaseUrl: process.env.TWOB_BASE_URL ?? 'https://2b.com.eg',
  elarabyEnabled: process.env.ELARABY_ENABLED !== 'false',
  elarabyBaseUrl: process.env.ELARABY_BASE_URL ?? 'https://www.elarabygroup.com',
}));
