import { ConfigService } from '@nestjs/config';
import { FxRatesService } from '../../src/matching/fx-rates.service';

describe('FxRatesService (offline fallback table)', () => {
  const service = new FxRatesService({
    get: (key: string, fallback?: unknown) => (key === 'pricing.fxRatesEnabled' ? false : fallback),
  } as ConfigService);

  it('leaves base-currency amounts alone', async () => {
    expect(await service.convert(18999, 'EGP')).toBe(18999);
    expect(await service.convert(18999, 'egp ')).toBe(18999);
  });

  it('converts a known currency', async () => {
    expect(await service.convert(100, 'USD')).toBe(5000);
  });

  it('returns null for a currency with no known rate instead of assuming 1:1 (L-18)', async () => {
    expect(await service.convert(100, 'CNY')).toBeNull();
    expect(await service.getRateToBase('XYZ')).toBeNull();
  });
});
