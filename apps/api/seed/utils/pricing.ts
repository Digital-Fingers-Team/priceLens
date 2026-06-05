import type { StoreDefinition } from '../types';
import { SeededRandom } from './random';

const CATEGORY_MODIFIERS: Record<string, number> = {
  smartphones: 1.08,
  laptops: 1.12,
  'graphics-cards': 1.18,
  processors: 1.06,
  monitors: 0.98,
  televisions: 1.03,
  headphones: 0.94,
  tablets: 1.02,
  'smart-watches': 0.96,
  'gaming-consoles': 1.04,
  'home-appliances': 1.0,
};

export function priceForProduct(basePrice: number, attributes: Record<string, unknown>, categorySlug: string): number {
  let price = basePrice * (CATEGORY_MODIFIERS[categorySlug] ?? 1);
  const storage = String(attributes.storage ?? '');
  const ram = String(attributes.ram ?? '');
  const variant = String(attributes.variant ?? '');
  const edition = String(attributes.edition ?? '');

  price *= storageMultiplier(storage);
  price *= ramMultiplier(ram);
  if (/\b(pro max|ultra|max)\b/i.test(variant)) price *= 1.32;
  else if (/\b(pro|plus|ti|xtx|super)\b/i.test(variant)) price *= 1.18;
  if (/\b(oled|mini led|founders|sapphire|gallery|bundle|absolute)\b/i.test(edition)) price *= 1.15;

  return roundMoney(price);
}

export function listingPrice(
  productBasePrice: number,
  store: StoreDefinition,
  categorySlug: string,
  now: Date,
  random: SeededRandom,
): number {
  const seasonal = seasonalModifier(now, categorySlug);
  const promotion = random.bool(0.11) ? random.float(0.84, 0.96) : 1;
  const noise = random.float(0.985, 1.015);
  return roundMoney(productBasePrice * store.priceModifier * seasonal * promotion * noise);
}

export function historyPrice(
  currentPrice: number,
  categorySlug: string,
  recordedAt: Date,
  dayIndex: number,
  random: SeededRandom,
): { price: number; originalPrice: number | null; inStock: boolean } {
  const lifecycle = 1 + Math.min(dayIndex, 180) * 0.0009;
  const seasonal = seasonalModifier(recordedAt, categorySlug);
  const dailyWave = 1 + Math.sin(dayIndex / 8) * 0.012;
  const flashSale = random.bool(0.035) ? random.float(0.78, 0.92) : 1;
  const promotion = random.bool(0.075) ? random.float(0.88, 0.97) : 1;
  const noise = random.float(0.992, 1.008);
  const price = roundMoney(currentPrice * lifecycle * seasonal * dailyWave * flashSale * promotion * noise);
  const discounted = flashSale < 1 || promotion < 1;
  return {
    price,
    originalPrice: discounted ? roundMoney(price / Math.min(flashSale, promotion)) : null,
    inStock: !random.bool(0.018),
  };
}

function seasonalModifier(date: Date, categorySlug: string): number {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (month === 11 && day >= 20) return 0.92;
  if (month === 12 && day <= 27) return 0.95;
  if (categorySlug === 'home-appliances' && [5, 6, 7].includes(month)) return 0.97;
  if (categorySlug === 'laptops' && [8, 9].includes(month)) return 0.96;
  if (categorySlug === 'gaming-consoles' && month === 12) return 1.04;
  return 1 + Math.sin((month / 12) * Math.PI * 2) * 0.015;
}

function storageMultiplier(storage: string): number {
  if (/2TB/i.test(storage)) return 1.55;
  if (/1TB/i.test(storage)) return 1.34;
  if (/512GB/i.test(storage)) return 1.18;
  if (/256GB/i.test(storage)) return 1.08;
  return 1;
}

function ramMultiplier(ram: string): number {
  if (/64GB/i.test(ram)) return 1.42;
  if (/32GB/i.test(ram)) return 1.24;
  if (/24GB/i.test(ram)) return 1.18;
  if (/16GB/i.test(ram)) return 1.1;
  return 1;
}

export function roundMoney(value: number): number {
  return Math.max(19.99, Math.round(value * 100) / 100);
}
