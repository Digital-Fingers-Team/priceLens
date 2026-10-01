/**
 * Price per kilo or litre from a product title ("Nescafe Gold 200g",
 * "Juhayna milk 6 x 1L"), so different pack sizes compare fairly. Returns
 * null when the title names no size, or names it ambiguously.
 */
export interface UnitPrice {
  perUnit: number;
  unit: 'kg' | 'L';
}

const SIZE = /(?:(\d+)\s*[x×*]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|kilo|كيلو|g|gm|gram|grams|جرام|جم|l|ltr|liter|litre|لتر|ml|مل)(?!\p{L})/giu;

export function unitPrice(title: string, price: number | null | undefined): UnitPrice | null {
  if (!price || price <= 0) return null;
  const matches = [...title.toLowerCase().matchAll(SIZE)];
  // Two different sizes ("500g ... 1kg") is ambiguous: say nothing.
  if (matches.length !== 1) return null;
  const [, packRaw, amountRaw, unitRaw] = matches[0];
  const pack = packRaw ? Number(packRaw) : 1;
  const amount = Number(amountRaw.replace(',', '.')) * pack;
  if (!(amount > 0)) return null;

  const unit = unitRaw.toLowerCase();
  const isWeight = ['kg', 'kilo', 'كيلو', 'g', 'gm', 'gram', 'grams', 'جرام', 'جم'].includes(unit);
  const inBase = ['kg', 'kilo', 'كيلو', 'l', 'ltr', 'liter', 'litre', 'لتر'].includes(unit) ? amount : amount / 1000;
  // Outside these, the "size" is probably something else (a 2000 g phone? a 64 L fridge).
  if (inBase < 0.01 || inBase > 50) return null;
  return { perUnit: Math.round((price / inBase) * 100) / 100, unit: isWeight ? 'kg' : 'L' };
}
