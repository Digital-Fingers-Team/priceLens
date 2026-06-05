import type { CanonicalProductSeed, StoreDefinition } from '../types';
import { SeededRandom } from './random';

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bPro Max\b/g, 'PM'],
  [/\bNatural Titanium\b/g, 'Nat Titanium'],
  [/\bGraphics Card\b/g, 'GPU'],
  [/\bPlayStation\b/g, 'PS'],
  [/\bNintendo Switch\b/g, 'Switch'],
  [/\bWireless\b/g, 'WL'],
  [/\bNoise Cancelling\b/g, 'ANC'],
  [/\bInternational Version\b/g, 'Intl Version'],
];

const MISSPELLINGS: Array<[RegExp, string]> = [
  [/\bSamsung\b/g, 'Samsng'],
  [/\bPlayStation\b/g, 'Play Station'],
  [/\bMacBook\b/g, 'Mac Book'],
  [/\bGeForce\b/g, 'Geforce'],
];

export function mutateTitle(product: CanonicalProductSeed, store: StoreDefinition, random: SeededRandom): string {
  let title = product.title;
  const attrs = product.attributes;
  const suffix = [
    attrs.storage,
    attrs.ram && product.categorySlug !== 'smartphones' ? `${attrs.ram} RAM` : undefined,
    attrs.color,
  ].filter(Boolean).join(' ');

  switch (store.titleStyle) {
    case 'dash':
      title = [product.model, attrs.variant, attrs.storage, attrs.color].filter(Boolean).join(' - ');
      break;
    case 'compact':
      title = [product.brand, abbreviate(product.model), attrs.variant, attrs.storage].filter(Boolean).join(' ');
      break;
    case 'marketplace':
      title = `${product.title} ${random.pick(['New', 'Official Warranty', 'Fast Shipping', 'Retail Box'])}`;
      break;
    case 'verbose':
      title = `${product.brand} ${product.model} ${suffix} ${random.pick(['Brand New', 'Original', 'Genuine'])}`.trim();
      break;
    case 'clean':
    default:
      title = `${product.title}${random.bool(0.35) && suffix ? ` ${suffix}` : ''}`.trim();
  }

  if (random.bool(0.35)) title = ABBREVIATIONS.reduce((acc, [pattern, value]) => acc.replace(pattern, value), title);
  if (random.bool(0.08)) title = MISSPELLINGS.reduce((acc, [pattern, value]) => acc.replace(pattern, value), title);
  if (random.bool(0.18)) title = title.replace(/\b(\d+)\s?GB\b/g, '$1 GB');
  if (random.bool(0.12)) title = title.replace(/\s+/g, ' | ');
  if (random.bool(0.16)) title = reorderTitle(title, random);
  return title.replace(/\s+/g, ' ').trim();
}

export function normalizeTitle(title: string): string {
  return title
    .replace(/[|,()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

function abbreviate(value: string): string {
  return value
    .replace(/\biPhone\b/g, 'iP')
    .replace(/\bGalaxy\b/g, 'Gal')
    .replace(/\bPlayStation\b/g, 'PS')
    .replace(/\bMacBook\b/g, 'MB');
}

function reorderTitle(title: string, random: SeededRandom): string {
  const parts = title.split(/\s+-\s+|\s+\|\s+/).filter(Boolean);
  if (parts.length < 2) return title;
  const first = parts.shift();
  if (!first) return title;
  return random.bool() ? [...parts, first].join(' ') : [parts[0], first, ...parts.slice(1)].join(' ');
}
