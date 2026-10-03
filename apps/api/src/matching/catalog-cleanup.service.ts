import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ReconciliationService } from './reconciliation.service';
import { PHONE_ACCESSORIES_SLUG, isPhoneAccessory } from './text/phone-accessory';

/** Rows changed per statement, so no single update holds the table for long. */
const CHUNK = 1000;

export interface CategoryMove {
  productId: string;
  fromCategoryId: string;
  toCategoryId: string;
}

export interface CatalogCleanupReport {
  apply: boolean;
  /** Phone accessories filed under another category (moved to Phone Accessories). */
  recategorized: CategoryMove[];
  /** Products left with no listing, merged into the product their listings moved to. */
  emptiedMerged: number;
  /** Products with no listing and no history: deleted. */
  emptyDeleted: number;
  /** Duplicates of a product with the same normalized title, merged into it. */
  identicalMerged: number;
  /** Identical titles kept apart by the conflict guards (brand, model, variant). */
  identicalKeptApart: number;
  /** Price points re-pointed to the product their listing belongs to now. */
  historyRepointed: number;
}

interface EmptyProduct {
  id: string;
  /** Where its listings belong now: by its price history, else its latest match decision. */
  target: string | null;
}

/**
 * One-off repair of what category-scoped matching left behind (2026-10-03).
 *
 * A product's category was whichever sweep found its listing, and matching
 * only looked inside that category. The same phone case found by the
 * Headphones sweep one day and the Smart Watches sweep the next was created
 * twice, and its listing moved to the new copy, leaving the old one empty:
 * 27,851 empty products and 10,182 groups of identical titles split across
 * categories. Ingestion no longer does this (ListingProcessor: a seen listing
 * keeps its product, step 7a looks across categories, phone accessories have
 * one home); this cleans up the stored catalogue:
 *
 *  1. Phone accessories move to Phone Accessories.
 *  2. Empty products: merged into the product their listings moved to, traced
 *     by price history or match decisions (their URL then redirects there),
 *     or deleted when nothing traces them.
 *  3. Identical normalized titles: merged into the copy with the most
 *     listings, unless the conflict guards tell them apart.
 *  4. Price history follows its listing to the product it belongs to now.
 *
 * Merges are logged in product_merges as decidedBy 'cleanup' (undoable, not
 * sent to the AI review). Look-alikes that are not identical (another
 * colour, another wording) are left to the hourly reconciliation and its AI
 * judge, which now compares across categories too.
 */
@Injectable()
export class CatalogCleanupService {
  private readonly logger = new Logger(CatalogCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  async run({ apply = false }: { apply?: boolean } = {}): Promise<CatalogCleanupReport> {
    const report: CatalogCleanupReport = {
      apply,
      recategorized: await this.recategorizePhoneAccessories(apply),
      emptiedMerged: 0,
      emptyDeleted: 0,
      identicalMerged: 0,
      identicalKeptApart: 0,
      historyRepointed: 0,
    };
    Object.assign(report, await this.cleanEmptyProducts(apply));
    Object.assign(report, await this.mergeIdenticalTitles(apply));
    report.historyRepointed = await this.repointHistory(apply);
    return report;
  }

  /** Step 1. Returns the moves (the caller keeps them as a rollback file). */
  private async recategorizePhoneAccessories(apply: boolean): Promise<CategoryMove[]> {
    const home = await this.prisma.category.findUnique({ where: { slug: PHONE_ACCESSORIES_SLUG } });
    if (!home) {
      this.logger.warn(`No "${PHONE_ACCESSORIES_SLUG}" category: run the migrations first. Skipping recategorization.`);
      return [];
    }
    const products = await this.prisma.canonicalProduct.findMany({
      where: { categoryId: { not: home.id } },
      select: { id: true, title: true, categoryId: true },
    });
    const moves = products
      .filter((product) => isPhoneAccessory(product.title))
      .map((product) => ({ productId: product.id, fromCategoryId: product.categoryId, toCategoryId: home.id }));
    this.logger.log(`Phone accessories to move: ${moves.length} of ${products.length}`);
    if (apply) {
      for (let i = 0; i < moves.length; i += CHUNK) {
        await this.prisma.canonicalProduct.updateMany({
          where: { id: { in: moves.slice(i, i + CHUNK).map((move) => move.productId) } },
          data: { categoryId: home.id },
        });
      }
    }
    return moves;
  }

  /** Step 2. */
  private async cleanEmptyProducts(apply: boolean): Promise<Pick<CatalogCleanupReport, 'emptiedMerged' | 'emptyDeleted'>> {
    const empty = await this.prisma.$queryRaw<EmptyProduct[]>(Prisma.sql`
      SELECT cp.id,
        COALESCE(
          (SELECT sl.canonical_product_id
             FROM price_history ph
             JOIN source_listings sl ON sl.id = ph.source_listing_id
            WHERE ph.canonical_product_id = cp.id
              AND sl.canonical_product_id IS NOT NULL
              AND sl.canonical_product_id <> cp.id
            GROUP BY sl.canonical_product_id
            ORDER BY COUNT(*) DESC, sl.canonical_product_id
            LIMIT 1),
          -- Most never had a price point; the match decision names the listing.
          (SELECT sl.canonical_product_id
             FROM match_decisions md
             JOIN source_listings sl ON sl.id = md.source_listing_id
            WHERE md.candidate_id = cp.id
              AND sl.canonical_product_id IS NOT NULL
              AND sl.canonical_product_id <> cp.id
            ORDER BY md.created_at DESC
            LIMIT 1)
        ) AS target
      FROM canonical_products cp
      WHERE NOT EXISTS (SELECT 1 FROM source_listings sl WHERE sl.canonical_product_id = cp.id)
    `);
    const traced = empty.filter((row) => row.target !== null);
    const untraced = empty.filter((row) => row.target === null).map((row) => row.id);
    this.logger.log(`Empty products: ${empty.length} (${traced.length} traced to where their listings went, ${untraced.length} not)`);
    if (!apply) return { emptiedMerged: traced.length, emptyDeleted: untraced.length };

    let emptiedMerged = 0;
    for (const [index, row] of traced.entries()) {
      if (await this.mergeIfPresent(row.target!, row.id, true)) emptiedMerged += 1;
      if ((index + 1) % 1000 === 0) this.logger.log(`  merged ${index + 1}/${traced.length} empty products`);
    }

    // Deleted only while still empty and unreferenced: ingestion keeps running.
    let emptyDeleted = 0;
    for (let i = 0; i < untraced.length; i += CHUNK) {
      emptyDeleted += await this.prisma.$executeRaw(Prisma.sql`
        DELETE FROM canonical_products cp
        WHERE cp.id IN (${Prisma.join(untraced.slice(i, i + CHUNK))})
          AND NOT EXISTS (SELECT 1 FROM source_listings x WHERE x.canonical_product_id = cp.id)
          AND NOT EXISTS (SELECT 1 FROM price_history x WHERE x.canonical_product_id = cp.id)
          AND NOT EXISTS (SELECT 1 FROM price_alerts x WHERE x.canonical_product_id = cp.id)
          AND NOT EXISTS (SELECT 1 FROM watchlist_items x WHERE x.canonical_product_id = cp.id)
      `);
    }
    return { emptiedMerged, emptyDeleted };
  }

  /** Step 3. */
  private async mergeIdenticalTitles(
    apply: boolean,
  ): Promise<Pick<CatalogCleanupReport, 'identicalMerged' | 'identicalKeptApart'>> {
    // Strongest copy first: most listings, then the oldest (stable URL).
    const groups = await this.prisma.$queryRaw<Array<{ ids: string[] }>>(Prisma.sql`
      SELECT array_agg(cp.id ORDER BY n.listings DESC, cp.created_at, cp.id) AS ids
      FROM canonical_products cp
      CROSS JOIN LATERAL (
        SELECT COUNT(*) AS listings FROM source_listings sl WHERE sl.canonical_product_id = cp.id
      ) n
      WHERE n.listings > 0
      GROUP BY cp.normalized_title
      HAVING COUNT(*) > 1
    `);
    this.logger.log(`Identical-title groups: ${groups.length}`);

    let identicalMerged = 0;
    let identicalKeptApart = 0;
    for (const [index, { ids }] of groups.entries()) {
      const rows = await this.prisma.canonicalProduct.findMany({ where: { id: { in: ids } } });
      const byId = new Map(rows.map((row) => [row.id, row]));
      // Each copy joins the first earlier copy the guards accept (a group can
      // hold two brands with the same model name), or stays as a keeper.
      const keepers: typeof rows = [];
      for (const id of ids) {
        const row = byId.get(id);
        if (!row) continue;
        const keep = keepers.find((keeper) => !this.reconciliation.hasHardConflict(keeper, row));
        if (!keep) {
          if (keepers.length > 0) identicalKeptApart += 1;
          keepers.push(row);
          continue;
        }
        if (!apply || (await this.mergeIfPresent(keep.id, row.id, false))) identicalMerged += 1;
      }
      if ((index + 1) % 1000 === 0) this.logger.log(`  checked ${index + 1}/${groups.length} identical-title groups`);
    }
    return { identicalMerged, identicalKeptApart };
  }

  /** Step 4. */
  private async repointHistory(apply: boolean): Promise<number> {
    if (!apply) {
      const [row] = await this.prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
        SELECT COUNT(*) AS n FROM price_history ph
        JOIN source_listings sl ON sl.id = ph.source_listing_id
        WHERE sl.canonical_product_id IS NOT NULL AND ph.canonical_product_id <> sl.canonical_product_id
      `);
      return Number(row?.n ?? 0);
    }
    return this.prisma.$executeRaw(Prisma.sql`
      UPDATE price_history ph SET canonical_product_id = sl.canonical_product_id
      FROM source_listings sl
      WHERE sl.id = ph.source_listing_id
        AND sl.canonical_product_id IS NOT NULL
        AND ph.canonical_product_id <> sl.canonical_product_id
    `);
  }

  /**
   * Merges `mergeId` into `keepId` when both still exist (and, for an empty
   * product, it is still empty): ingestion runs alongside.
   */
  private async mergeIfPresent(keepId: string, mergeId: string, mustBeEmpty: boolean): Promise<boolean> {
    const [keep, merge] = await Promise.all([
      this.prisma.canonicalProduct.findUnique({ where: { id: keepId } }),
      this.prisma.canonicalProduct.findUnique({ where: { id: mergeId } }),
    ]);
    if (!keep || !merge) return false;
    if (mustBeEmpty && (await this.prisma.sourceListing.count({ where: { canonicalProductId: mergeId } })) > 0) return false;
    await this.reconciliation.mergeCanonicals(keep, merge, 'cleanup');
    return true;
  }
}
