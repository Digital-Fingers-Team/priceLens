import { MatchStatus, type PrismaClient } from '@prisma/client';
import { NormalizerService } from '../normalizer.service';
import { toMatchingText } from '../text/arabic';
import { extractMemorySpec } from '../text/specs';

/**
 * Finds and splits products whose listings are different RAM/storage
 * variants (audit 00 F-17, audit 02 L-04). Before phase 02, a listing whose
 * RAM could not be read joined any variant, so products like the Galaxy A57
 * collected 8GB and 12GB listings together.
 *
 * The plan is pure (planVariantSplit). Applying it moves listings and their
 * price history to one new product per extra variant, one transaction per
 * product, and returns rollback entries that rollbackVariantSplits undoes.
 */

type Dimension = 'ram' | 'storage';
const DIMENSIONS: Dimension[] = ['ram', 'storage'];

export interface ListingForRepair {
  id: string;
  rawTitle: string;
}

export interface VariantGroup {
  /** The varying dimensions' values, e.g. { ram: '12GB' }. */
  variant: Partial<Record<Dimension, string>>;
  listingIds: string[];
}

export interface VariantSplitPlan {
  /** Dimensions whose known values disagree across the product's listings. */
  varying: Dimension[];
  /** The largest group; it stays on the product. */
  keep: VariantGroup;
  /** Every other group; each becomes a new product. */
  splits: VariantGroup[];
  /** Listings that do not state a varying dimension: left where they are. */
  unknown: string[];
}

export function listingVariant(rawTitle: string): Partial<Record<Dimension, string>> {
  const spec = extractMemorySpec(toMatchingText(rawTitle));
  return { ...(spec.ram ? { ram: spec.ram } : {}), ...(spec.storage ? { storage: spec.storage } : {}) };
}

/** Null when the product's listings do not disagree on RAM or storage. */
export function planVariantSplit(listings: ListingForRepair[]): VariantSplitPlan | null {
  const variants = listings.map((listing) => ({ id: listing.id, variant: listingVariant(listing.rawTitle) }));

  const varying = DIMENSIONS.filter(
    (dimension) => new Set(variants.map((v) => v.variant[dimension]).filter(Boolean)).size > 1,
  );
  if (varying.length === 0) return null;

  const groups = new Map<string, VariantGroup>();
  const unknown: string[] = [];
  for (const { id, variant } of variants) {
    if (varying.some((dimension) => !variant[dimension])) {
      unknown.push(id);
      continue;
    }
    const key = varying.map((dimension) => variant[dimension]).join('|');
    const group: VariantGroup = groups.get(key) ?? {
      variant: Object.fromEntries(varying.map((dimension) => [dimension, variant[dimension]])),
      listingIds: [],
    };
    group.listingIds.push(id);
    groups.set(key, group);
  }

  // Largest group stays; ties broken by the variant key so a rerun plans the
  // same way.
  const ordered = [...groups.entries()]
    .sort(([keyA, a], [keyB, b]) => b.listingIds.length - a.listingIds.length || keyA.localeCompare(keyB))
    .map(([, group]) => group);

  return { varying, keep: ordered[0], splits: ordered.slice(1), unknown: unknown.sort() };
}

export interface ProductRepairReport {
  productId: string;
  slug: string;
  title: string;
  plan: VariantSplitPlan;
}

export interface RollbackEntry {
  originalProductId: string;
  newProductId: string;
  listingIds: string[];
}

const ACCEPTED = [MatchStatus.ACCEPTED, MatchStatus.MANUAL_ACCEPT];

/** Every product whose accepted listings mix RAM or storage variants. */
export async function findVariantMixes(
  prisma: PrismaClient,
  options: { productSlug?: string } = {},
): Promise<ProductRepairReport[]> {
  const products = await prisma.canonicalProduct.findMany({
    where: {
      ...(options.productSlug ? { slug: options.productSlug } : {}),
      sourceListings: { some: { matchStatus: { in: ACCEPTED } } },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      sourceListings: {
        where: { matchStatus: { in: ACCEPTED } },
        select: { id: true, rawTitle: true },
        orderBy: { id: 'asc' },
      },
    },
    orderBy: { id: 'asc' },
  });

  const reports: ProductRepairReport[] = [];
  for (const product of products) {
    if (product.sourceListings.length < 2) continue;
    const plan = planVariantSplit(product.sourceListings);
    if (plan) reports.push({ productId: product.id, slug: product.slug, title: product.title, plan });
  }
  return reports;
}

function slugPart(variant: Partial<Record<Dimension, string>>): string {
  return DIMENSIONS.filter((dimension) => variant[dimension])
    .map((dimension) => `${variant[dimension]!.toLowerCase()}${dimension === 'ram' ? '-ram' : ''}`)
    .join('-');
}

/** Applies each report's plan; one transaction per product. */
export async function applyVariantSplits(
  prisma: PrismaClient,
  reports: ProductRepairReport[],
): Promise<RollbackEntry[]> {
  const normalizer = new NormalizerService();
  const rollback: RollbackEntry[] = [];

  for (const report of reports) {
    const entries = await prisma.$transaction(async (tx) => {
      const original = await tx.canonicalProduct.findUniqueOrThrow({ where: { id: report.productId } });
      const created: RollbackEntry[] = [];

      for (const split of report.plan.splits) {
        const first = await tx.sourceListing.findUniqueOrThrow({
          where: { id: split.listingIds[0] },
          select: { rawTitle: true, rawImageUrl: true },
        });
        const baseSlug = `${original.slug}-${slugPart(split.variant)}`;
        let slug = baseSlug;
        for (let n = 2; await tx.canonicalProduct.findUnique({ where: { slug }, select: { id: true } }); n += 1) {
          slug = `${baseSlug}-${n}`;
        }

        const product = await tx.canonicalProduct.create({
          data: {
            slug,
            title: first.rawTitle,
            normalizedTitle: normalizer.normalizeTitle(first.rawTitle).normalized,
            categoryId: original.categoryId,
            brand: original.brand,
            model: original.model,
            tier: original.tier,
            imageUrl: first.rawImageUrl ?? original.imageUrl,
            attributes: { ...(original.attributes as object), ...split.variant },
          },
        });
        await tx.sourceListing.updateMany({
          where: { id: { in: split.listingIds }, canonicalProductId: original.id },
          data: { canonicalProductId: product.id },
        });
        await tx.priceHistory.updateMany({
          where: { sourceListingId: { in: split.listingIds }, canonicalProductId: original.id },
          data: { canonicalProductId: product.id },
        });
        created.push({ originalProductId: original.id, newProductId: product.id, listingIds: split.listingIds });
      }
      return created;
    });
    rollback.push(...entries);
  }
  return rollback;
}

/**
 * Undoes applyVariantSplits: listings and history go back, and each new
 * product is deleted unless something else now points at it (it is then
 * left in place and reported).
 */
export async function rollbackVariantSplits(
  prisma: PrismaClient,
  entries: RollbackEntry[],
): Promise<{ restored: number; keptProducts: string[] }> {
  let restored = 0;
  const keptProducts: string[] = [];

  for (const entry of entries) {
    const remaining = await prisma.$transaction(async (tx) => {
      const moved = await tx.sourceListing.updateMany({
        where: { id: { in: entry.listingIds }, canonicalProductId: entry.newProductId },
        data: { canonicalProductId: entry.originalProductId },
      });
      await tx.priceHistory.updateMany({
        where: { sourceListingId: { in: entry.listingIds }, canonicalProductId: entry.newProductId },
        data: { canonicalProductId: entry.originalProductId },
      });
      restored += moved.count;
      return tx.sourceListing.count({ where: { canonicalProductId: entry.newProductId } });
    });

    // Outside the transaction: a delete refused by a foreign key (a watchlist
    // entry added since the split) must not undo the move above.
    if (remaining > 0) {
      keptProducts.push(entry.newProductId);
      continue;
    }
    try {
      await prisma.canonicalProduct.delete({ where: { id: entry.newProductId } });
    } catch {
      keptProducts.push(entry.newProductId);
    }
  }
  return { restored, keptProducts };
}
