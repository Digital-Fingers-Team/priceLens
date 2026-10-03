import { describe, expect, it } from 'vitest';
import { parseQuoteLines } from './quotes';

describe('parseQuoteLines', () => {
  it('reads name, quantity and budget per line', () => {
    expect(parseQuoteLines('Lenovo IdeaPad 3 i5 8GB, 50, 22000\nHP monitor 24\n\n')).toEqual([
      { query: 'Lenovo IdeaPad 3 i5 8GB', quantity: 50, maxUnitPrice: 22000 },
      { query: 'HP monitor 24' },
    ]);
  });

  it('ignores a bad quantity or budget and lines that are too short', () => {
    expect(parseQuoteLines('Printer, abc, xyz\nx, 2')).toEqual([{ query: 'Printer' }]);
  });
});
