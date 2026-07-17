// apps/api/src/matching/fx-rates.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RateTable {
  /** currency code -> units of that currency per 1 unit of the base currency's reference (USD). */
  perUsd: Record<string, number>;
  fetchedAt: number;
}

/**
 * Approximate fallback rates (to EGP) used only when the live fetch is
 * unreachable/disabled — mirrors SemanticService's "degrade, don't fail"
 * pattern for OpenRouter. Good enough to keep listings roughly comparable;
 * the live fetch (cached hours at a time) is the real source of truth.
 */
const FALLBACK_RATES_TO_EGP: Record<string, number> = {
  EGP: 1,
  USD: 50,
  AED: 13.6,
  SAR: 13.3,
  QAR: 13.7,
  KWD: 163,
  EUR: 54,
  GBP: 63,
};

@Injectable()
export class FxRatesService {
  private readonly logger = new Logger(FxRatesService.name);
  private readonly baseCurrency: string;
  private readonly apiUrl: string;
  private readonly enabled: boolean;
  private readonly cacheTtlMs: number;

  private cachedTable: RateTable | null = null;
  private inFlight: Promise<RateTable | null> | null = null;

  constructor(private readonly config: ConfigService) {
    this.baseCurrency = this.config.get<string>('pricing.fxBaseCurrency', 'EGP').toUpperCase();
    this.apiUrl = this.config.get<string>('pricing.fxRatesApiUrl', 'https://open.er-api.com/v6/latest/USD');
    this.enabled = this.config.get<boolean>('pricing.fxRatesEnabled', true);
    this.cacheTtlMs = this.config.get<number>('pricing.fxRatesCacheTtlMs', 12 * 60 * 60 * 1000);
  }

  get base(): string {
    return this.baseCurrency;
  }

  /** Convert `amount` in `fromCurrency` into the base currency (EGP). */
  async convert(amount: number, fromCurrency: string): Promise<number> {
    const currency = (fromCurrency || this.baseCurrency).trim().toUpperCase();
    if (currency === this.baseCurrency) {
      return amount;
    }

    const rate = await this.getRateToBase(currency);
    return amount * rate;
  }

  /** Units of the base currency (EGP) equal to 1 unit of `currency`. */
  async getRateToBase(currency: string): Promise<number> {
    const code = currency.trim().toUpperCase();
    if (code === this.baseCurrency) return 1;

    const table = await this.getRateTable();
    if (table) {
      const perUsdBase = table.perUsd[this.baseCurrency];
      const perUsdCurrency = table.perUsd[code];
      if (perUsdBase && perUsdCurrency) {
        // rates[X] = units of X per 1 USD, so units of base per 1 X = perUsdBase / perUsdCurrency.
        return perUsdBase / perUsdCurrency;
      }
      this.logger.warn(`FX table missing rate for "${code}" or base "${this.baseCurrency}" — using fallback table`);
    }

    return FALLBACK_RATES_TO_EGP[code] ?? this.fallbackViaEgpRatio(code);
  }

  /** Last-resort: derive from the static table's EGP ratios, or assume parity if totally unknown. */
  private fallbackViaEgpRatio(code: string): number {
    const known = FALLBACK_RATES_TO_EGP[code];
    if (known) return known;
    this.logger.warn(`No FX rate known for currency "${code}" (live and fallback both missed) — treating as 1:1 with base currency, comparisons may be inaccurate`);
    return 1;
  }

  private async getRateTable(): Promise<RateTable | null> {
    if (!this.enabled) return null;

    if (this.cachedTable && Date.now() - this.cachedTable.fetchedAt < this.cacheTtlMs) {
      return this.cachedTable;
    }

    // Multiple listings can request a conversion concurrently during ingestion;
    // share one in-flight fetch instead of firing a request per listing.
    if (!this.inFlight) {
      this.inFlight = this.fetchRateTable().finally(() => {
        this.inFlight = null;
      });
    }

    return this.inFlight;
  }

  private async fetchRateTable(): Promise<RateTable | null> {
    try {
      const response = await fetch(this.apiUrl, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) {
        throw new Error(`FX rates HTTP ${response.status}`);
      }

      const data = (await response.json()) as { rates?: Record<string, number> };
      if (!data.rates || typeof data.rates !== 'object') {
        throw new Error('FX rates response missing "rates" object');
      }

      const table: RateTable = {
        perUsd: Object.fromEntries(
          Object.entries(data.rates).map(([code, value]) => [code.toUpperCase(), value]),
        ),
        fetchedAt: Date.now(),
      };
      this.cachedTable = table;
      return table;
    } catch (err) {
      this.logger.warn(`FX rate fetch failed, using static fallback table: ${(err as Error).message}`);
      return this.cachedTable; // stale cache beats no cache; null falls through to the static table
    }
  }
}
