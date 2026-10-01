import { describe, expect, it } from 'vitest';
import { unitPrice } from './unit-price';

describe('unitPrice', () => {
  it('per kilo from grams, per litre from a multipack', () => {
    expect(unitPrice('Nescafe Gold 200g', 300)).toEqual({ perUnit: 1500, unit: 'kg' });
    expect(unitPrice('Juhayna Milk 6 x 1L', 180)).toEqual({ perUnit: 30, unit: 'L' });
    expect(unitPrice('عصير 330 مل', 15)).toEqual({ perUnit: 45.45, unit: 'L' });
  });

  it('says nothing without one clear size', () => {
    expect(unitPrice('iPhone 15 128GB', 40000)).toBeNull();
    expect(unitPrice('Coffee 250g + mug 1kg bundle', 400)).toBeNull();
    expect(unitPrice('Rice 1kg', 0)).toBeNull();
  });
});
