import { ProductTier } from '@prisma/client';
import { v5 as uuidv5 } from 'uuid';
import type { CanonicalProductSeed, CatalogProductInput, SeedConfig } from '../types';
import { priceForProduct } from '../utils/pricing';
import { normalizeTitle, slugify } from '../utils/titleMutator';

export function createCanonicalProduct(
  input: CatalogProductInput,
  categoryId: string,
  config: SeedConfig,
): CanonicalProductSeed {
  const attributes = compactAttributes({
    series: input.definition.series,
    variant: input.variant,
    storage: input.storage,
    ram: input.ram,
    color: input.color,
    displaySize: input.displaySize,
    cpu: input.cpu,
    gpu: input.gpu,
    refreshRate: input.refreshRate,
    capacity: input.capacity,
    energyRating: input.energyRating,
    edition: input.edition,
    releaseYear: input.releaseYear,
  });
  const title = buildTitle(input);
  const slugBase = slugify(`${title}-${input.releaseYear}-${input.sequence}`);
  const id = uuidv5(`canonical:${slugBase}`, config.seedNamespace);
  const basePrice = priceForProduct(input.definition.basePrice, attributes, input.definition.categorySlug);

  return {
    id,
    categorySlug: input.definition.categorySlug,
    categoryId,
    slug: slugBase,
    title,
    normalizedTitle: normalizeTitle(title),
    brand: input.definition.brand,
    model: productModel(input),
    sku: skuFor(input, input.sequence),
    gtin: gtinFor(input.sequence),
    mpn: mpnFor(input),
    attributes,
    basePrice,
    tier: tierFor(basePrice),
    searchBoost: input.definition.searchBoost ?? 1,
    imageUrl: imageFor(input.definition.brand, input.definition.categorySlug),
    thumbnailUrl: imageFor(input.definition.brand, input.definition.categorySlug, true),
    createdAt: config.now,
    updatedAt: config.now,
  };
}

function buildTitle(input: CatalogProductInput): string {
  const parts = [
    input.definition.brand,
    input.model,
    displayVariant(input.variant),
    input.storage,
    input.ram && input.definition.categorySlug !== 'smartphones' ? `${input.ram} RAM` : undefined,
    input.cpu,
    input.gpu && input.gpu !== 'Integrated' ? input.gpu : undefined,
    input.displaySize,
    input.refreshRate,
    input.capacity,
    input.color,
    input.edition,
  ];
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function productModel(input: CatalogProductInput): string {
  return [input.model, displayVariant(input.variant)].filter(Boolean).join(' ');
}

function displayVariant(variant: string | undefined): string | undefined {
  return variant && variant !== 'Standard' ? variant : undefined;
}

function compactAttributes(values: Record<string, string | number | boolean | undefined>): Record<string, string | number | boolean> {
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string | number | boolean] => entry[1] != null));
}

function skuFor(input: CatalogProductInput, sequence: number): string {
  return slugify([
    input.definition.brand.slice(0, 3),
    input.model,
    input.variant,
    input.storage,
    input.ram,
    input.color,
    input.releaseYear,
    sequence,
  ].filter(Boolean).join('-')).toUpperCase();
}

function gtinFor(sequence: number): string {
  return `${8800000000000 + sequence}`.slice(0, 13);
}

function mpnFor(input: CatalogProductInput): string {
  return slugify(`${input.definition.brand}-${input.model}-${input.variant ?? 'std'}-${input.storage ?? input.ram ?? input.edition ?? 'base'}`)
    .toUpperCase()
    .slice(0, 64);
}

function tierFor(price: number): ProductTier {
  if (price >= 1_500) return ProductTier.ULTRA_PREMIUM;
  if (price >= 750) return ProductTier.PREMIUM;
  if (price >= 250) return ProductTier.MID_RANGE;
  return ProductTier.BUDGET;
}

function imageFor(brand: string, categorySlug: string, thumb = false): string {
  const size = thumb ? '300x300' : '900x900';
  return `https://dummyimage.com/${size}/f2f4f7/1f2937.png&text=${encodeURIComponent(`${brand} ${categorySlug}`)}`;
}
