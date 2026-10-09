import * as path from 'path';
import { registerAs } from '@nestjs/config';

export default registerAs('retailers', () => ({
  liveIngestionLimit: parseInt(process.env.LIVE_INGESTION_LIMIT ?? '25', 10),
  // Listings priced under this (EGP, after currency conversion) are dropped
  // before matching. A category's own min_price_egp overrides it; the original
  // electronics categories are seeded with 0 (no floor).
  minListingPriceEgp: parseInt(process.env.MIN_LISTING_PRICE_EGP ?? '5000', 10),
  // The scheduled sweep covers wave 0 (the original categories) plus waves
  // 1..categorySweepMaxWave, at most maxCategorySweepsPerRun of those per run,
  // least recently swept first. 0 turns the new categories' sweep off.
  // A broad search every store answers; a store that answers it is not
  // blocked, so its empty answers in that sweep don't pause it.
  storeProbeQuery: process.env.STORE_PROBE_QUERY ?? 'samsung,tv',
  categorySweepMaxWave:parseInt(process.env.CATEGORY_SWEEP_MAX_WAVE ?? '0', 10),
  maxCategorySweepsPerRun: parseInt(process.env.MAX_CATEGORY_SWEEPS_PER_RUN ?? '15', 10),
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
  // Scrape jobs running at once in the worker (workers/scrape-slots.ts, D-9).
  scrapeConcurrency: Math.max(1, parseInt(process.env.SCRAPE_CONCURRENCY ?? '2', 10) || 2),
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
  // Competitor detection, offset from the ingestion cron so it reads prices
  // that have just been refreshed rather than racing the scraper.
  competitorDetectionCron: process.env.COMPETITOR_DETECTION_CRON ?? '45 */3 * * *',
  // Brand-side sweeps, staggered after competitor detection.
  mapSweepCron: process.env.MAP_SWEEP_CRON ?? '50 */3 * * *',
  launchDetectionCron: process.env.LAUNCH_DETECTION_CRON ?? '20 */6 * * *',
  // Monday morning, covering the week that just ended.
  weeklyReportsCron: process.env.WEEKLY_REPORTS_CRON ?? '0 6 * * 1',
  // price_history -> price_daily rollup (PriceRollupService).
  priceRollupCron: process.env.PRICE_ROLLUP_CRON ?? '35 */6 * * *',
  // Baskets re-priced against their target (CartWatchService).
  cartWatchCron: process.env.CART_WATCH_CRON ?? '40 * * * *',
  // Second-hand ranges from OpenSooq (UsedMarketService): when, and how many products a night.
  usedMarketCron: process.env.USED_MARKET_CRON ?? '15 1 * * *',
  usedMarketBatch: parseInt(process.env.USED_MARKET_BATCH ?? '120', 10),
  // Seller tools: repricer suggestions (hourly) and search-rank checks (daily).
  sellerRepricerCron: process.env.SELLER_REPRICER_CRON ?? '50 * * * *',
  rankTrackingCron: process.env.RANK_TRACKING_CRON ?? '30 2 * * *',
  // Importer tools: FX rates (CBE publishes during the Cairo working day),
  // the import-opportunity rebuild (after the nightly rollup) and the weekly
  // trend radar (Saturday, once the Saturday-to-Friday week is complete).
  fxRefreshCron: process.env.FX_REFRESH_CRON ?? '20 7,13 * * *',
  importFinderCron: process.env.IMPORT_FINDER_CRON ?? '10 4 * * *',
  trendRadarCron: process.env.TREND_RADAR_CRON ?? '40 4 * * 6',
  // Personal-data cleanup (DataRetentionService), as the privacy policy
  // promises: page views and store clicks after about 13 months, sign-in
  // sessions 90 days after they ended.
  dataRetentionCron: process.env.DATA_RETENTION_CRON ?? '50 3 * * *',
  pageViewRetentionDays: parseInt(process.env.PAGE_VIEW_RETENTION_DAYS ?? '395', 10),
  affiliateClickRetentionDays: parseInt(process.env.AFFILIATE_CLICK_RETENTION_DAYS ?? '395', 10),
  sessionRetentionDays: parseInt(process.env.SESSION_RETENTION_DAYS ?? '90', 10),
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
  // Minimum gap between two searches sent to the same store, and the wait
  // before the one retry of a search that threw (StoreCallGuard, B-07).
  storeMinRequestIntervalMs: parseInt(process.env.STORE_MIN_REQUEST_INTERVAL_MS ?? '2000', 10),
  storeRetryDelayMs: parseInt(process.env.STORE_RETRY_DELAY_MS ?? '3000', 10),
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
  dream2000Enabled: process.env.DREAM2000_ENABLED !== 'false',
  dream2000BaseUrl: process.env.DREAM2000_BASE_URL ?? 'https://dream2000.com',
  tradelineEnabled: process.env.TRADELINE_ENABLED !== 'false',
  tradelineBaseUrl: process.env.TRADELINE_BASE_URL ?? 'https://tradelinestores.com',
  compumartsEnabled: process.env.COMPUMARTS_ENABLED !== 'false',
  compumartsBaseUrl: process.env.COMPUMARTS_BASE_URL ?? 'https://compumarts.com',
  btechEnabled: process.env.BTECH_ENABLED !== 'false',
  rayaEnabled: process.env.RAYA_ENABLED !== 'false',
  rayaBaseUrl: process.env.RAYA_BASE_URL ?? 'https://www.rayashop.com',
  rayaApiUrl: process.env.RAYA_API_URL ?? 'https://api-rayashop.global.ssl.fastly.net',
  sigmaEnabled: process.env.SIGMA_ENABLED !== 'false',
  sigmaBaseUrl: process.env.SIGMA_BASE_URL ?? 'https://www.sigma-computer.com',
  homzmartEnabled: process.env.HOMZMART_ENABLED !== 'false',
  homzmartBaseUrl: process.env.HOMZMART_BASE_URL ?? 'https://homzmart.com',
  freshEnabled: process.env.FRESH_ENABLED !== 'false',
  freshBaseUrl: process.env.FRESH_BASE_URL ?? 'https://fresh.com.eg',
  freshApiUrl: process.env.FRESH_API_URL ?? 'https://freshmprod.hypernode.io',
  samsungEnabled: process.env.SAMSUNG_ENABLED !== 'false',
  samsungBaseUrl: process.env.SAMSUNG_BASE_URL ?? 'https://www.samsung.com',
  samsungApiUrl: process.env.SAMSUNG_API_URL ?? 'https://sribsrch.ecom.samsung.com/estoresearch-api/v1/scom/search',
  gourmetEnabled: process.env.GOURMET_ENABLED !== 'false',
  gourmetBaseUrl: process.env.GOURMET_BASE_URL ?? 'https://gourmetegypt.com',
  spinneysEnabled: process.env.SPINNEYS_ENABLED !== 'false',
  spinneysBaseUrl: process.env.SPINNEYS_BASE_URL ?? 'https://www.spinneys-egypt.com',
  seoudiEnabled: process.env.SEOUDI_ENABLED !== 'false',
  seoudiBaseUrl: process.env.SEOUDI_BASE_URL ?? 'https://seoudisupermarket.com',
  seoudiApiUrl: process.env.SEOUDI_API_URL ?? 'https://mcprod.seoudisupermarket.com',
}));
