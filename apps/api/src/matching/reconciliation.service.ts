// apps/api/src/matching/reconciliation.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { FuzzyMatcherService } from './fuzzy-matcher.service';
import { NormalizerService } from './normalizer.service';
import { SemanticService } from './semantic.service';
import { capacityGb, checkConflicts, normalizeListing } from './pipeline';
import type { MatchingTools } from './pipeline';

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
 * (the matching pipeline, src/matching/pipeline), but products stored before
 * a matcher fix -- or split incorrectly -- are never re-examined, which is what
 * leaves so many products showing only "1 store". This job closes that gap by
 * re-running conflict guards + model agreement + LLM judgement over the stored
 * catalog and collapsing confirmed duplicates onto one canonical.
 *
 * Its guards ARE the pipeline's (step 8, checkConflicts), so a pair the
 * ingestion matcher would keep apart is never merged here, and color is never
 * a conflict (owner decision D-6). On top of them it is stricter about
 * variants a title leaves out: merging two stored products is destructive,
 * so one that states its RAM or storage is never merged with one that does
 * not (audit 02, L-04).
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);
  private readonly tools: MatchingTools;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly semantic: SemanticService,
    private readonly fuzzyMatcher: FuzzyMatcherService,
    private readonly normalizer: NormalizerService,
  ) {
    this.tools = { normalizer, fuzzy: fuzzyMatcher };
  }

  async reconcile(options: ReconciliationOptions = {}): Promise<ReconciliationReport> {
    const dryRun = options.dryRun ?? this.config.get<boolean>('search.reconciliationDryRun', true);
    const maxPairs = options.maxPairs ?? this.config.get<number>('search.reconciliationMaxPairs', 200);
    const threshold = this.config.get<number>('search.reconciliationSimilarityThreshold', 0.82);
    const neighborsPerProduct = this.config.get<number>('search.reconciliationNeighborsPerProduct', 5);

    // Two complementary candidate sources, deduped. Trigram similarity catches
    // near-identical titles; model-agreement catches genuine cross-store
    // duplicates whose titles are worded so differently that trigram similarity
    // falls below the threshold (a real case: "OPPO A6 Smartphone, 256 GB,
    // Sapphire Blue, ... 8 GB RAM" vs "Oppo A6 - 8GB RAM - 256GB - Sapphire
    // Blue" scored only 0.52 — below 0.82 — even though every structured
    // attribute agrees). Model-agreement pairs go first so they aren't crowded
    // out of the maxPairs budget by high-trigram-but-different variants.
    const modelPairs = await this.findModelAgreementPairs(maxPairs);
    const trigramPairs = await this.findCandidatePairs(threshold, maxPairs, neighborsPerProduct);
    const pairs = this.dedupePairs([...modelPairs, ...trigramPairs]).slice(0, maxPairs);
    this.logger.log(
      `Reconciliation start (dryRun=${dryRun}): ${pairs.length} candidate pair(s) ` +
        `(${modelPairs.length} by model agreement, ${trigramPairs.length} by trigram >= ${threshold})`,
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

      // If the model number extracted fresh from each title agrees, that's a
      // stronger, more reliable signal than the small local LLM judge: testing
      // showed qwen2.5:1.5b incorrectly rejects real duplicates worded
      // differently by two stores (e.g. "Oppo A6 - 8GB RAM - 256GB" vs "OPPO
      // A6 Smartphone, 256 GB, ... 8 GB RAM") even though every structured
      // attribute agrees. Recomputed from the title rather than trusting the
      // stored `model` column, since older rows predate model extraction for
      // several phone brands. Skip the LLM call entirely when it agrees.
      const modelA = this.normalizer.extractAttributes(a.title).model?.trim().toLowerCase();
      const modelB = this.normalizer.extractAttributes(b.title).model?.trim().toLowerCase();
      // Not for accessories: their model is the phone they fit, which every
      // case and screen protector for that phone shares.
      const modelsAgree = !!modelA && !!modelB && modelA === modelB && !this.normalizer.isAccessory(a.title);

      const verdict = modelsAgree ? true : await this.semantic.judgeSameProduct(a.title, b.title);
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
   * For each canonical product, find its `neighborsPerProduct` nearest
   * same-category neighbours by title-trigram similarity (pg_trgm, already
   * GIN-indexed on `normalized_title`), then keep the pairs within the
   * similarity threshold. `a_id < b_id` collapses the two directions of each
   * pair into one row.
   *
   * This used to rank neighbours by title-embedding cosine distance
   * (pgvector). That was actively counterproductive here: nomic-embed-text
   * scored the SAME phone worded differently by two stores at ~0.54 —
   * *below* two completely different phone models (~0.53) — while scoring a
   * wrong-color variant of the exact same listing at ~1.0. At the 0.82
   * threshold that meant almost every genuine cross-store duplicate was
   * silently excluded before it ever reached the LLM judge (confirmed by
   * checking one directly: a known duplicate pair sat at 0.54, a known
   * non-duplicate pair sat at 1.0). Trigram similarity ranks these sanely —
   * the true duplicate outscores the wrong-color variant — and the
   * `hasHardConflict` guard below (the pipeline's step 8 guards) still
   * does the real precision filtering before any pair reaches the LLM.
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
                 nn.sim AS similarity
          FROM canonical_products a
          JOIN LATERAL (
            SELECT b.id, similarity(a.normalized_title, b.normalized_title) AS sim
            FROM canonical_products b
            WHERE b.category_id = a.category_id
              AND b.id <> a.id
            ORDER BY a.normalized_title <-> b.normalized_title
            LIMIT ${neighborsPerProduct}
          ) nn ON true
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
   * Candidate pairs sharing the same category + brand + extracted model,
   * regardless of title trigram similarity. This is the signal that actually
   * identifies a cross-store duplicate: two stores rewrite the title around the
   * model code so completely that trigram similarity misses them, but the
   * brand+model still agree. Brand and model are recomputed fresh from the
   * title (falling back to the stored `brand` column) because older rows predate
   * model extraction for several phone brands and have an empty `model` column.
   *
   * These pairs are deliberately permissive — a same brand+model group still
   * contains different storage/colour/RAM variants (e.g. every "OPPO A6"). That
   * is intentional: `hasHardConflict` in the main loop rejects the variant
   * mismatches, and only the genuinely-identical pairs survive to be merged.
   */
  private async findModelAgreementPairs(maxPairs: number): Promise<CandidatePair[]> {
    const products = await this.prisma.canonicalProduct.findMany({
      select: { id: true, title: true, brand: true, categoryId: true },
    });

    const groups = new Map<string, string[]>();
    for (const product of products) {
      const extracted = this.normalizer.extractAttributes(product.title);
      const brand = (product.brand ?? extracted.brand)?.trim().toLowerCase();
      const model = extracted.model?.trim().toLowerCase();
      if (!brand || !model) continue;

      const key = `${product.categoryId}|${brand}|${model}`;
      const bucket = groups.get(key);
      if (bucket) {
        bucket.push(product.id);
      } else {
        groups.set(key, [product.id]);
      }
    }

    const pairs: CandidatePair[] = [];
    for (const ids of groups.values()) {
      if (ids.length < 2) continue;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const [a_id, b_id] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]];
          // similarity is nominal here — model agreement, not title text, is
          // what qualified this pair; it only affects log output.
          pairs.push({ a_id, b_id, similarity: 1 });
          if (pairs.length >= maxPairs) return pairs;
        }
      }
    }
    return pairs;
  }

  /** Collapse duplicate (a_id, b_id) pairs, keeping the first (higher-priority) occurrence. */
  private dedupePairs(pairs: CandidatePair[]): CandidatePair[] {
    const seen = new Set<string>();
    const result: CandidatePair[] = [];
    for (const pair of pairs) {
      const key = `${pair.a_id}|${pair.b_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(pair);
    }
    return result;
  }

  /**
   * The pipeline's step 8 guards between two stored products (one read as the
   * "listing", the other as the candidate), plus: RAM or storage stated by
   * one and not the other, and the variant fields of the stored `attributes`
   * column. Any of these means "not provably the same product" -- skip
   * before spending an LLM call. Color is never a conflict (D-6).
   */
  private hasHardConflict(a: CanonicalRow, b: CanonicalRow): boolean {
    const input = normalizeListing(
      {
        title: a.title,
        priceUsd: null,
        currency: 'EGP',
        brand: a.brand,
        model: a.model,
        identifiers: { gtin: a.gtin, upc: a.upc, ean: a.ean, mpn: a.mpn },
      },
      this.tools,
    );
    const guard = checkConflicts(input, b, this.tools);
    if (guard.conflict !== null) return true;

    for (const dimension of ['ram', 'storage'] as const) {
      const stated = [input.extracted[dimension], guard.candidateExtracted[dimension]].filter(
        (value) => capacityGb(value) !== null,
      ).length;
      if (stated === 1) return true;
    }

    // The stored `attributes` column is checked as well as the title, because a
    // variant is often recorded only in structured data (a listing titled
    // "... 256GB" whose attributes say 512GB, or a title that omits capacity
    // entirely). Checking the title alone let those merge into one product.
    // Either source showing a conflict blocks the merge: leaving a duplicate in
    // the catalog is far cheaper to fix than collapsing two real variants into
    // one, which destroys their separate price histories.
    const storedA = this.readVariantAttributes(a);
    const storedB = this.readVariantAttributes(b);
    return !!(
      this.fuzzyMatcher.detectStorageConflict(storedA.storage, storedB.storage) ||
      this.fuzzyMatcher.detectRamConflict(storedA.ram, storedB.ram) ||
      this.fuzzyMatcher.detectDisplaySizeConflict(storedA.displaySize, storedB.displaySize)
    );
  }

  /** Variant-defining fields as recorded on the canonical row itself. */
  private readVariantAttributes(row: CanonicalRow): {
    storage?: string;
    ram?: string;
    displaySize?: string;
  } {
    const attributes = (row.attributes ?? {}) as Record<string, unknown>;
    const read = (key: string): string | undefined => {
      const value = attributes[key];
      if (value == null) return undefined;
      const text = String(value).trim();
      return text.length > 0 ? text : undefined;
    };

    return {
      storage: read('storage'),
      ram: read('ram'),
      displaySize: read('displaySize') ?? read('display_size') ?? read('screenSize'),
    };
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
