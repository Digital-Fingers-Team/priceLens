import { registerAs } from '@nestjs/config';

export default registerAs('retailers', () => ({
  liveIngestionLimit: parseInt(process.env.LIVE_INGESTION_LIMIT ?? '25', 10),
  liveIngestionScheduleEnabled: process.env.LIVE_INGESTION_SCHEDULE_ENABLED !== 'false',
  liveIngestionCron: process.env.LIVE_INGESTION_CRON ?? '0 */6 * * *',
  amazonEnabled: process.env.AMAZON_ENABLED !== 'false',
  amazonBaseUrl: process.env.AMAZON_BASE_URL ?? 'https://www.amazon.com',
  alibabaEnabled: process.env.ALIBABA_ENABLED !== 'false',
  alibabaBaseUrl: process.env.ALIBABA_BASE_URL ?? 'https://www.alibaba.com',
  noonEnabled: process.env.NOON_ENABLED !== 'false',
  noonBaseUrl: process.env.NOON_BASE_URL ?? 'https://www.noon.com',
  jumiaEnabled: process.env.JUMIA_ENABLED !== 'false',
  jumiaBaseUrl: process.env.JUMIA_BASE_URL ?? 'https://www.jumia.com.eg',
  carrefourEnabled: process.env.CARREFOUR_ENABLED !== 'false',
  carrefourBaseUrl: process.env.CARREFOUR_BASE_URL ?? 'https://www.carrefouruae.com',
  twoBEnabled: process.env.TWOB_ENABLED !== 'false',
  twoBBaseUrl: process.env.TWOB_BASE_URL ?? 'https://2b.com.eg',
  elarabyEnabled: process.env.ELARABY_ENABLED !== 'false',
  elarabyBaseUrl: process.env.ELARABY_BASE_URL ?? 'https://www.elarabygroup.com',
}));
