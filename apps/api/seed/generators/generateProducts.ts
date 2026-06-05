import type { PrismaClient } from '@prisma/client';
import type { Client } from 'pg';
import { categories } from '../datasets/categories';
import { productCatalogs } from '../datasets';
import { createCanonicalProduct } from '../factories/canonicalProductFactory';
import type { CanonicalProductSeed, CatalogProductInput, ProductModelDefinition, SeedConfig } from '../types';
import { copyRows } from '../utils/batchInsert';

const PRODUCT_COLUMNS = [
  'id',
  'category_id',
  'slug',
  'title',
  'normalized_title',
  'brand',
  'model',
  'sku',
  'gtin',
  'mpn',
  'attributes',
  'image_url',
  'thumbnail_url',
  'tier',
  'is_verified',
  'search_boost',
  'created_at',
  'updated_at',
];

export async function upsertCategories(prisma: PrismaClient): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const roots = categories.filter((category) => !category.parentSlug);
  const children = categories.filter((category) => category.parentSlug);

  for (const category of roots) {
    const created = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        level: category.level,
        searchTerms: category.searchTerms,
      },
      create: {
        slug: category.slug,
        name: category.name,
        level: category.level,
        searchTerms: category.searchTerms,
      },
    });
    result.set(category.slug, created.id);
  }

  for (const category of children) {
    const parentId = category.parentSlug ? result.get(category.parentSlug) : undefined;
    if (!parentId) throw new Error(`Missing parent category ${category.parentSlug}`);
    const created = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        parentId,
        level: category.level,
        searchTerms: category.searchTerms,
      },
      create: {
        slug: category.slug,
        name: category.name,
        parentId,
        level: category.level,
        searchTerms: category.searchTerms,
      },
    });
    result.set(category.slug, created.id);
  }

  return result;
}

export function buildProductSeeds(config: SeedConfig, categoryIds: Map<string, string>): CanonicalProductSeed[] {
  const products: CanonicalProductSeed[] = [];
  for (let index = 0; index < config.productTarget; index += 1) {
    const definition = productCatalogs[index % productCatalogs.length];
    const localIndex = Math.floor(index / productCatalogs.length);
    const categoryId = categoryIds.get(definition.categorySlug);
    if (!categoryId) throw new Error(`Missing category id for ${definition.categorySlug}`);
    products.push(createCanonicalProduct(productInput(definition, localIndex, index + 1), categoryId, config));
  }
  return products;
}

export async function insertProducts(
  prisma: PrismaClient,
  client: Client,
  config: SeedConfig,
  runId: string,
  products: CanonicalProductSeed[],
): Promise<number> {
  const checkpoint = await readCursor(prisma, runId, 'products');
  let inserted = 0;
  for (let index = checkpoint; index < products.length; index += config.batchSize) {
    const batch = products.slice(index, index + config.batchSize);
    inserted += await copyRows(client, 'canonical_products', PRODUCT_COLUMNS, batch.map(productRow));
    await saveCheckpoint(prisma, runId, 'products', Math.min(index + batch.length, products.length), inserted);
    logProgress(config, 'products', Math.min(index + batch.length, products.length), products.length);
  }
  return inserted;
}

function productInput(definition: ProductModelDefinition, localIndex: number, sequence: number): CatalogProductInput {
  let cursor = localIndex;
  const next = <T>(values: readonly T[] | undefined): T | undefined => {
    if (!values || values.length === 0) return undefined;
    const value = values[cursor % values.length];
    cursor = Math.floor(cursor / values.length);
    return value;
  };

  return {
    definition,
    model: next(definition.models) ?? definition.series,
    variant: next(definition.variants),
    storage: next(definition.storage),
    ram: next(definition.ram),
    color: next(definition.colors),
    displaySize: next(definition.displaySizes),
    cpu: next(definition.cpu),
    gpu: next(definition.gpu),
    refreshRate: next(definition.refreshRates),
    capacity: next(definition.capacities),
    energyRating: next(definition.energyRatings),
    edition: next(definition.editions),
    releaseYear: next(definition.releaseYears) ?? new Date().getUTCFullYear(),
    sequence,
  };
}

function productRow(product: CanonicalProductSeed) {
  return [
    product.id,
    product.categoryId,
    product.slug,
    product.title,
    product.normalizedTitle,
    product.brand,
    product.model,
    product.sku,
    product.gtin,
    product.mpn,
    product.attributes,
    product.imageUrl,
    product.thumbnailUrl,
    product.tier,
    true,
    product.searchBoost,
    product.createdAt,
    product.updatedAt,
  ];
}

async function readCursor(prisma: PrismaClient, runId: string, stage: string): Promise<number> {
  const checkpoint = await prisma.seedCheckpoint.findUnique({ where: { runId_stage: { runId, stage } } });
  return checkpoint?.cursor ?? 0;
}

async function saveCheckpoint(prisma: PrismaClient, runId: string, stage: string, cursor: number, insertedRows: number): Promise<void> {
  await prisma.seedCheckpoint.upsert({
    where: { runId_stage: { runId, stage } },
    update: { cursor, insertedRows },
    create: { runId, stage, cursor, insertedRows },
  });
}

function logProgress(config: SeedConfig, stage: string, current: number, total: number): void {
  if (current === total || current % config.logInterval < config.batchSize) {
    console.log(`[seed] ${stage}: ${current.toLocaleString()}/${total.toLocaleString()}`);
  }
}
