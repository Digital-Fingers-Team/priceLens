import { describe, expect, it } from 'vitest';
import { rtlUnits, shapeArabic } from './arabic-shape';

const hex = (s: string) => [...s].map((c) => c.codePointAt(0)!.toString(16));

describe('shapeArabic', () => {
  it('picks initial, medial and final forms', () => {
    // م ت ج ر: meem initial, teh medial, jeem medial, reh final
    expect(hex(shapeArabic('متجر'))).toEqual(['fee3', 'fe98', 'fea0', 'feae']);
  });

  it('does not join after a right-joining letter', () => {
    // و ا ح د: waw isolated, alef isolated, hah initial, dal final
    expect(hex(shapeArabic('واحد'))).toEqual(['feed', 'fe8d', 'fea3', 'feaa']);
  });

  it('makes lam-alef one ligature and drops harakat', () => {
    expect(hex(shapeArabic('لا'))).toEqual(['fefb']);
    expect(hex(shapeArabic('كلا'))).toEqual(['fedb', 'fefc']);
    expect(shapeArabic('مُحَمَّد')).toBe(shapeArabic('محمد'));
  });
});

describe('rtlUnits', () => {
  it('keeps word order and Latin runs', () => {
    const units = rtlUnits('سامسونج جالاكسي A57 5G - أسود');
    expect(units).toHaveLength(5);
    expect(units[2]).toBe('A57 5G');
    expect(units[3]).toBe('-');
    // Arabic words come out reversed (visual order)
    expect(units[0]).toBe([...shapeArabic('سامسونج')].reverse().join(''));
  });

  it('drops bidi marks and splits on no-break spaces', () => {
    expect(rtlUnits('8,150.00 ج.م.‏')).toEqual(['8,150.00', [...shapeArabic('ج.م.')].reverse().join('')]);
  });
});
