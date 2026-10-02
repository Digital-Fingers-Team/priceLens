import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FxSource } from '@prisma/client';
import { parseCbeRates, zonedDay } from './trade-math';

/** EGP per 1 unit of `currency` on `rateDate` (YYYY-MM-DD, Cairo). */
export interface FxQuote {
  currency: string;
  buy: number | null;
  sell: number | null;
  mid: number;
  rateDate: string;
}

/** A source of USD/EGP (and other) rates, stored over time by FxTrackingService. */
export interface FxRateProvider {
  readonly source: FxSource;
  fetchRates(): Promise<FxQuote[]>;
}

/** The currencies the tracker keeps: what cross-border stores price in, plus the Gulf. */
export const TRACKED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY', 'SAR', 'AED'] as const;

const TIME_ZONE = 'Africa/Cairo';
// The site rejects requests without a browser-like agent.
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const round4 = (value: number) => Math.round(value * 1e4) / 1e4;

/** The Central Bank of Egypt's official buy / sell table, read from its public page. */
@Injectable()
export class CbeFxProvider implements FxRateProvider {
  readonly source = FxSource.CBE;
  private readonly url: string;

  constructor(config: ConfigService) {
    this.url = config.get<string>('pricing.cbeRatesUrl', 'https://www.cbe.org.eg/en/economic-research/statistics/cbe-exchange-rates');
  }

  async fetchRates(): Promise<FxQuote[]> {
    const response = await fetch(this.url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`CBE rates HTTP ${response.status}`);
    const parsed = parseCbeRates(await response.text());
    if (parsed.rates.length === 0) throw new Error('CBE rates page had no rate table (layout changed or request rejected)');
    const rateDate = parsed.rateDate ?? zonedDay(new Date(), TIME_ZONE);
    return parsed.rates
      .filter((rate) => (TRACKED_CURRENCIES as readonly string[]).includes(rate.currency))
      .map((rate) => ({ ...rate, mid: round4((rate.buy + rate.sell) / 2), rateDate }));
  }
}

/**
 * The market reference: the same keyless mid-market feed ingestion converts
 * listing prices with (FX_RATES_API_URL), so the tracker shows the rate the
 * stored prices were actually converted at.
 */
@Injectable()
export class MarketFxProvider implements FxRateProvider {
  readonly source = FxSource.MARKET;
  private readonly url: string;

  constructor(config: ConfigService) {
    this.url = config.get<string>('pricing.fxRatesApiUrl', 'https://open.er-api.com/v6/latest/USD');
  }

  async fetchRates(): Promise<FxQuote[]> {
    const response = await fetch(this.url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Market rates HTTP ${response.status}`);
    const data = (await response.json()) as { rates?: Record<string, number>; time_last_update_unix?: number };
    const perUsd = data.rates ?? {};
    const egp = perUsd.EGP;
    if (!(egp > 0)) throw new Error('Market rates response has no EGP rate');
    const at = data.time_last_update_unix ? new Date(data.time_last_update_unix * 1000) : new Date();
    const rateDate = zonedDay(at, TIME_ZONE);
    return TRACKED_CURRENCIES.flatMap((currency) => {
      const units = perUsd[currency];
      if (!(units > 0)) return [];
      return [{ currency, buy: null, sell: null, mid: round4(egp / units), rateDate }];
    });
  }
}

export const FX_RATE_PROVIDERS = 'FX_RATE_PROVIDERS';
