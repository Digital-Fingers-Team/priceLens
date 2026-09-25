import { describe, expect, it } from 'vitest';
import { formatCurrency, formatNumber } from './format';

describe('formatCurrency', () => {
  // Intl separates the currency code and the amount with a no-break space.
  it('defaults to EGP with two decimals', () => {
    expect(formatCurrency(26325)).toBe('EGP\u00a026,325.00');
  });

  it('uses the listing currency when given', () => {
    expect(formatCurrency(19.5, 'USD')).toBe('$19.50');
  });

  it('shows a dash for a missing price instead of 0', () => {
    expect(formatCurrency(null)).toBe('—');
    expect(formatCurrency(undefined)).toBe('—');
  });

  it('keeps a real zero', () => {
    expect(formatCurrency(0)).toBe('EGP\u00a00.00');
  });
});

describe('formatNumber', () => {
  it('groups thousands', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });
});
