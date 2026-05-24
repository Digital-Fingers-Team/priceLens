import { registerAs } from '@nestjs/config';

export default registerAs('retailers', () => ({
  bestBuyApiKey: process.env.BESTBUY_API_KEY ?? '',
  bestBuyApiUrl: process.env.BESTBUY_API_URL ?? 'https://api.bestbuy.com/v1',
  liveIngestionLimit: parseInt(process.env.LIVE_INGESTION_LIMIT ?? '25', 10),
}));
