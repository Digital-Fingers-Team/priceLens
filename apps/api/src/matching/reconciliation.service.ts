// apps/api/src/matching/reconciliation.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { FuzzyMatcherService } from './fuzzy-matcher.service';
import { NormalizerService } from './normalizer.service';
import { SemanticService } from './semantic.service';

interface CandidatePair {
  a_id: string;
  b_id: string;
  similarity: number;
}

type CanonicalRow = Prisma.CanonicalProductGetPayload<Record<string, never>>;

export interface ReconciliationOptions {
  /** When true, only log proposed merges without touching the database. */
  dryRun?: boolean;
  /** Override the max number of candidate pairs to examine this run. */
  maxPairs?: number;
}

export interface ProposedMerge {
  keepId: string;
  keepTitle: string;
  mergeId: string;
  mergeTitle: string;
  similarity: number;
}

export interface ReconciliationReport {
  dryRun: boolean;
  pairsExamined: number;
  merges: ProposedMerge[];
}

/**
 * Background pass that re-checks EXISTING canonical products against each other
 * for duplicates and merges them. New listings are deduped at ingestion time
 * (see LiveIngestionService.findMatchViaLocalAi), but products stored before
 * semantic matching existed — or split incorrectly — are never re-examined,
 * which is what leaves so many products showing only "1 store". This job closes
 * that gap by re-running the same embedding + conflict-guard + LLM judgement over
 * the stored catalog and collapsing confirmed duplicates onto one canonical.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly semantic: SemanticService,
    private readonly fuzzyMatcher: FuzzyMatcherService,
    private readonly normalizer: NormalizerService,
  ) {}

  async reconcile(options: ReconciliationOptions = {}): Promise<ReconciliationReport> {
    const dryRun = options.dryRun ?? this.config.get<boolean>('search.reconciliationDryRun', true);
    const maxPairs = options.maxPairs ?? this.config.get<number>('search.reconciliationMaxPairs', 200);
    const threshold = this.config.get<number>('search.reconciliationSimilarityThreshold', 0.82);
    const neighborsPerProduct = this.config.get<number>('search.reconciliationNeighborsPerProduct', 5);

    const pairs = await this.findCandidatePairs(threshold, maxPairs, neighborsPerProduct);
    this.logger.log(
      `Reconciliation start (dryRun=${dryRun}): ${pairs.length} candidate pair(s) above similarity ${threshold}`,
    );

    const merges: ProposedMerge[] = [];
    // A canonical that's already been merged away this run must not be touched again.
    const consumed = new Set<string>();

    for (const pair of pairs) {
      if (consumed.has(pair.a_id) || consumed.has(pair.b_id)) continue;

      const [a, b] = await Promise.all([
        this.prisma.canonicalProduct.findUnique({ where: { id: pair.a_id } }),
        this.prisma.canonicalProduct.findUnique({ where: { id: pair.b_id } }),
      ]);
      if (!a || !b) continue;

      if (this.hasHardConflict(a, b)) continue;

      const verdict = await this.semantic.judgeSameProduct(a.title, b.title);
      if (verdict !== true) continue;

      // Keep the older canonical (stable ids, older price history), merge the newer in.
      const [keep, merge] = a.createdAt <= b.createdAt ? [a, b] : [b, a];
      merges.push({
        keepId: keep.id,
        keepTitle: keep.title,
        mergeId: merge.id,
        mergeTitle: merge.title,
        similarity: pair.similarity,
      });

      if (dryRun) {
        this.logger.log(
          `[dry-run] would merge "${merge.title}" (${merge.id}) → "${keep.title}" (${keep.id}) ` +
            `[sim ${pair.similarity.toFixed(3)}]`,
        );
      } else {
        await this.mergeCanonicals(keep, merge);
        this.logger.log(
          `Merged "${merge.title}" (${merge.id}) → "${keep.title}" (${keep.id}) [sim ${pair.similarity.toFixed(3)}]`,
        );
      }
      consumed.add(merge.id);
    }

    this.logger.log(
      `Reconciliation done (dryRun=${dryRun}): ${merges.length} ${dryRun ? 'proposed' : 'executed'} merge(s)`,
    );
    return { dryRun, pairsExamined: pairs.length, merges };
  }

  /**
   * For each canonical product, ask the HNSW index for its `neighborsPerProduct`
   * nearest same-category neighbours (LATERAL join → indexed KNN, not the old
   * O(n^2) cross-join), then keep the pairs within the similarity threshold.
   * `a_id < b_id` collapses the two directions of each pair into one row.
   */
  private async findCandidatePairs(
    threshold: number,
    maxPairs: number,
    neighborsPerProduct: number,
  ): Promise<CandidatePair[]> {
    return this.prisma.$queryRaw<CandidatePair[]>`
      WITH deduped AS (
        SELECT DISTINCT ON (a_id, b_id) a_id, b_id, similarity FROM (
          SELECT LEAST(a.id, nn.id) AS a_id, GREATEST(a.id, nn.id) AS b_id,
                 1 - (a.title_embedding <=> nn.title_embedding) AS similarity
          FROM canonical_products a
          JOIN LATERAL (
            SELECT b.id, b.title_embedding
            FROM canonical_products b
            WHERE b.category_id = a.category_id
              AND b.id <> a.id
              AND b.title_embedding IS NOT NULL
            ORDER BY a.title_embedding <=> b.title_embedding
            LIMIT ${neighborsPerProduct}
          ) nn ON true
          WHERE a.title_embedding IS NOT NULL
        ) pairs
        WHERE similarity >= ${threshold}
        ORDER BY a_id, b_id, similarity DESC
      )
      SELECT a_id, b_id, similarity FROM deduped
      ORDER BY similarity DESC
      LIMIT ${maxPairs}
    `;
  }

  /**
   * Mirror of LiveIngestionService's ingestion-time guards, but comparing two
   * stored canonicals: brand, accessory-vs-product, variant tier, conflicting
   * identifiers, and storage/RAM/color. Any hard conflict means "definitely not
   * the same product" — skip before spending an LLM call.
   */
  private hasHardConflict(a: CanonicalRow, b: CanonicalRow): boolean {
    const brandA = a.brand?.trim().toLowerCase() ?? null;
    const brandB = b.brand?.trim().toLowerCase() ?? null;
    if (brandA && brandB && brandA !== brandB) return true;

    if (this.normalizer.isAccessory(a.title) !== this.normalizer.isAccessory(b.title)) return true;

    if (this.fuzzyMatcher.detectVariantConflict(a.title, b.title)) return true;

    if (this.hasIdentifierConflict(a, b)) return true;

    const attrsA = (a.attributes ?? {}) as Record<string, unknown>;
    const attrsB = (b.attributes ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    if (
      this.fuzzyMatcher.detectStorageConflict(str(attrsA.storage), str(attrsB.storage)) ||
      this.fuzzyMatcher.detectRamConflict(str(attrsA.ram), str(attrsB.ram)) ||
      this.fuzzyMatcher.detectColorConflict(str(attrsA.color), str(attrsB.color))
    ) {
      return true;
    }

    return false;
  }

  private hasIdentifierConflict(a: CanonicalRow, b: CanonicalRow): boolean {
    const pairs: Array<[string | null, string | null]> = [
      [a.gtin, b.gtin],
      [a.upc, b.upc],
      [a.ean, b.ean],
      [a.mpn, b.mpn],
    ];
    return pairs.some(
      ([x, y]) => !!x && !!y && x.trim().toLowerCase() !== y.trim().toLowerCase(),
    );
  }

  /**
   * Reassign everything that points at `mergeId` onto `keepId`, then delete the
   * now-empty canonical — all in one transaction. WatchlistItem carries a
   * (userId, canonicalProductId) unique constraint, so a user watching both
   * products would collide on reassignment; those rows are dropped instead.
   *
   * Before deleting, any identifier / image the loser has but the keeper lacks is
   * copied onto the keeper so a unique GTIN/UPC/EAN/MPN isn't lost with the row.
   */
  private async mergeCanonicals(keep: CanonicalRow, merge: CanonicalRow): Promise<void> {
    const keepId = keep.id;
    const mergeId = merge.id;
    await this.prisma.$transaction(async (tx) => {
      await tx.sourceListing.updateMany({
        where: { canonicalProductId: mergeId },
        data: { canonicalProductId: keepId },
      });
      await tx.priceHistory.updateMany({
        where: { canonicalProductId: mergeId },
        data: { canonicalProductId: keepId },
      });
      await tx.priceAlert.updateMany({
        where: { canonicalProductId: mergeId },
        data: { canonicalProductId: keepId },
      });
      await tx.reviewQueue.updateMany({
        where: { canonicalProductId: mergeId },
        data: { canonicalProductId: keepId },
      });

      // Watchlist: move rows for users who aren't already watching the keeper,
      // delete the rest to respect @@unique([userId, canonicalProductId]).
      const keepWatchers = await tx.watchlistItem.findMany({
        where: { canonicalProductId: keepId },
        select: { userId: true },
      });
      const keepWatcherIds = new Set(keepWatchers.map((w) => w.userId));
      const mergeWatchers = await tx.watchlistItem.findMany({
        where: { canonicalProductId: mergeId },
        select: { id: true, userId: true },
      });
      for (const w of mergeWatchers) {
        if (keepWatcherIds.has(w.userId)) {
          await tx.watchlistItem.delete({ where: { id: w.id } });
        } else {
          await tx.watchlistItem.update({
            where: { id: w.id },
            data: { canonicalProductId: keepId },
          });
        }
      }

      // Delete the loser first so its unique identifiers are freed, then copy
      // any the keeper is missing onto the keeper without violating the
      // @unique constraints on gtin/upc/ean.
      await tx.canonicalProduct.delete({ where: { id: mergeId } });
      await this.backfillKeeper(tx, keep, merge);
    });
  }

  /**
   * Copy identifiers, image, and brand/model/sku the loser has but the keeper is
   * missing onto the keeper. Also merges the loser's `attributes` keys that the
   * keeper doesn't already define. No-op if the keeper is already fully populated.
   */
  private async backfillKeeper(
    tx: Prisma.TransactionClient,
    keep: CanonicalRow,
    merge: CanonicalRow,
  ): Promise<void> {
    const data: Prisma.CanonicalProductUpdateInput = {};

    const scalarKeys = [
      'gtin', 'upc', 'ean', 'mpn', 'sku', 'brand', 'model', 'imageUrl', 'thumbnailUrl',
    ] as const;
    for (const key of scalarKeys) {
      if (!keep[key] && merge[key]) {
        (data as Record<string, unknown>)[key] = merge[key];
      }
    }

    const keepAttrs = (keep.attributes ?? {}) as Record<string, unknown>;
    const mergeAttrs = (merge.attributes ?? {}) as Record<string, unknown>;
    const mergedAttrs: Record<string, unknown> = { ...mergeAttrs, ...keepAttrs };
    if (Object.keys(mergedAttrs).length > Object.keys(keepAttrs).length) {
      data.attributes = mergedAttrs as Prisma.InputJsonValue;
    }

    if (Object.keys(data).length === 0) return;
    await tx.canonicalProduct.update({ where: { id: keep.id }, data });
  }
}
