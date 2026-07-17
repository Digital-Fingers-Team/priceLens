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
  // to try to reach it (capped by however many stores are actually enabled).
  minStoresPerProduct: parseInt(process.env.MIN_STORES_PER_PRODUCT ?? '7', 10),
  // Reactive expansion (above) only fires for products someone actually browses
  // to (product detail page, or now a search hit). This periodic sweep catches
  // the rest of the catalog -- products under minStoresPerProduct that nobody
  // has viewed recently -- so coverage still improves in the background.
  storeCoverageSweepEnabled: process.env.STORE_COVERAGE_SWEEP_ENABLED !== 'false',
  // Catalog currently has ~2,700 products stuck under target coverage (mostly
  // still at 1 store) -- 25/2h would take ~9 days to work through once. Bumped
  // to clear it in under 2 days without going as aggressive as an unattended
  // full sweep (see the LIVE_INGESTION_SCHEDULE_ENABLED comment below for why
  // that one stays off: real-browser scraping is too slow/heavy to hammer).
  storeCoverageSweepCron: process.env.STORE_COVERAGE_SWEEP_CRON ?? '*/45 * * * *',
  storeCoverageSweepBatchSize: parseInt(process.env.STORE_COVERAGE_SWEEP_BATCH_SIZE ?? '60', 10),
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
