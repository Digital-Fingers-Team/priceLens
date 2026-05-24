import { registerAs } from '@nestjs/config';

export default registerAs('retailers', () => ({
  bestBuyApiKey: process.env.BESTBUY_API_KEY ?? '',
  bestBuyApiUrl: process.env.BESTBUY_API_URL ?? 'https://api.bestbuy.com/v1',
  liveIngestionLimit: parseInt(process.env.LIVE_INGESTION_LIMIT ?? '25', 10),
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
}));
