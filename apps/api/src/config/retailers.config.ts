import * as path from 'path';
import { registerAs } from '@nestjs/config';

export default registerAs('retailers', () => ({
  liveIngestionLimit: parseInt(process.env.LIVE_INGESTION_LIMIT ?? '25', 10),
  liveIngestionScheduleEnabled: process.env.LIVE_INGESTION_SCHEDULE_ENABLED !== 'false',
  liveIngestionCron: process.env.LIVE_INGESTION_CRON ?? '0 */6 * * *',
  amazonEnabled: process.env.AMAZON_ENABLED !== 'false',
  amazonBaseUrl: process.env.AMAZON_BASE_URL ?? 'https://www.amazon.com',
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
  carrefourBaseUrl: process.env.CARREFOUR_BASE_URL ?? 'https://www.carrefouruae.com',
  twoBEnabled: process.env.TWOB_ENABLED !== 'false',
  twoBBaseUrl: process.env.TWOB_BASE_URL ?? 'https://2b.com.eg',
  elarabyEnabled: process.env.ELARABY_ENABLED !== 'false',
  elarabyBaseUrl: process.env.ELARABY_BASE_URL ?? 'https://www.elarabygroup.com',
}));
