import { describe, expect, it } from 'vitest';
import { productTitle } from './product-title';

describe('productTitle', () => {
  const product = { title: 'Apple iPhone 18 Pro - 512GB', titleAr: 'ابل آيفون 18 برو - 512GB' };

  it('shows the Arabic title on the Arabic site', () => {
    expect(productTitle(product, 'ar')).toBe('ابل آيفون 18 برو - 512GB');
  });

  it('shows the store title on the English site', () => {
    expect(productTitle(product, 'en')).toBe('Apple iPhone 18 Pro - 512GB');
  });

  it('falls back to the store title until the Arabic one is translated', () => {
    expect(productTitle({ title: 'LG OLED TV', titleAr: null }, 'ar')).toBe('LG OLED TV');
    expect(productTitle({ title: 'LG OLED TV' }, 'ar')).toBe('LG OLED TV');
  });
});
