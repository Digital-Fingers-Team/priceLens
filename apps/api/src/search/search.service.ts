import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ProductTier } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OfferPolicy, liveOfferSql } from '../prices/offer-rules';
import { IngestionQueue } from '../workers/ingestion-queue.service';
import { ProductsService } from '../products/products.service';
import { escapeLike, normalizedTextSql, searchPhrase, searchTermGroups } from './search-text';
import { SearchQueryDto, SearchSortBy, SearchSortDir, SuggestQueryDto } from './dto/search.dto';

export interface SuggestionItem {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
}

/**
 * Product search and type-ahead suggestions, on Postgres (ADR 0003). Ranks
 * and filters in SQL; ProductsService maps the page of hits (A-15, B-16).
 */
@Injectable()
export class SearchService {
  /** How old an offer may be and still count as a current price (D-13). */
  private readonly offerMaxAgeDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ingestionQueue: IngestionQueue,
    private readonly products: ProductsService,
  ) {
    this.offerMaxAgeDays = this.config.get<number>('pricing.offerMaxAgeDays', 7);
  }

  private offerPolicy(): OfferPolicy {
    return { maxAgeDays: this.offerMaxAgeDays };
  }

  /**
   * One page of products matching the query and filters. Input arrives
   * validated (SearchQueryDto), so page/limit/prices are real numbers here.
   * Every search with a query also queues a live scrape of it (cooled down
   * per query); liveFetch=false skips that for internal callers.
   */
  async search(query: SearchQueryDto, options: { liveFetch?: boolean } = {}) {
    const started = Date.now();
    const {
      q = '',
      brand,
      categoryId,
      minPrice,
      maxPrice,
      tier,
      page = 1,
      limit = 20,
      sortBy = 'relevance',
      sortDir = 'desc',
    } = query;

    const normalizedQuery = q.trim().toLowerCase();
    const offset = (page - 1) * limit;

    const termGroups = searchTermGroups(normalizedQuery);
    const whereClause = this.buildSearchWhereSql(termGroups, brand, categoryId, tier);
    const havingClause = this.buildHavingSql(minPrice, maxPrice);
    const relevanceSql = this.buildRelevanceScoreSql(termGroups, normalizedQuery);
    const orderBySql = this.buildOrderBySql(sortBy, sortDir, relevanceSql, normalizedQuery);

    // Sort, filter and paginate in the database; only the current page's
    // products get their listings loaded.
    const [pageRows, countRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT cp.id
        FROM canonical_products cp
        JOIN categories c ON c.id = cp.category_id
        JOIN source_listings sl ON sl.canonical_product_id = cp.id
        WHERE ${whereClause}
        GROUP BY cp.id
        ${havingClause}
        ORDER BY ${orderBySql}
        LIMIT ${limit} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint as count FROM (
          SELECT cp.id
          FROM canonical_products cp
          JOIN categories c ON c.id = cp.category_id
          JOIN source_listings sl ON sl.canonical_product_id = cp.id
          WHERE ${whereClause}
          GROUP BY cp.id
          ${havingClause}
        ) matched
      `),
    ]);

    const total = Number(countRows[0]?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    let liveFetchTriggered = false;
    if (options.liveFetch !== false && normalizedQuery) {
      liveFetchTriggered = await this.triggerOnDemandLiveFetch(normalizedQuery);
    }

    const hits = await this.products.searchHits(pageRows.map((row) => row.id));

    return {
      hits,
      total,
      query: q.trim(),
      // Measured, not a placeholder: database time for this page (B-13).
      processingTimeMs: Date.now() - started,
      page: Math.min(page, totalPages),
      limit,
      liveFetchTriggered,
    };
  }

  /**
   * Type-ahead suggestions: the same term rules as search (Arabic normalized,
   * every term matched through any of its spellings), over title, brand,
   * model, slug and whole category words. Titles that start with what was
   * typed come first. Done in SQL with a LIMIT; it used to load every priced
   * product into memory on each keystroke (B-10).
   */
  async suggest({ q = '', limit = 6 }: SuggestQueryDto): Promise<SuggestionItem[]> {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return [];
    const termGroups = searchTermGroups(query);
    if (termGroups.length === 0) return [];

    const haystack = normalizedTextSql(
      Prisma.sql`concat_ws(' ', cp.title, cp.brand, cp.model, cp.slug)`,
    );
    const termMatches = termGroups.map(
      (alternatives) =>
        Prisma.sql`(${Prisma.join(
          alternatives.map(
            (term) => Prisma.sql`(
              ${haystack} LIKE ${`%${escapeLike(term)}%`}
              OR ${term} = ANY (string_to_array(lower(c.name), ' '))
            )`,
          ),
          ' OR ',
        )})`,
    );

    return this.prisma.$queryRaw<SuggestionItem[]>(Prisma.sql`
      SELECT cp.id, cp.slug, cp.title, cp.brand
      FROM canonical_products cp
      JOIN categories c ON c.id = cp.category_id
      WHERE EXISTS (
          SELECT 1 FROM source_listings sl
          WHERE sl.canonical_product_id = cp.id AND sl.price_usd IS NOT NULL
        )
        AND ${Prisma.join(termMatches, ' AND ')}
      ORDER BY (lower(cp.title) LIKE ${`${escapeLike(query)}%`}) DESC, cp.title ASC
      LIMIT ${limit}
    `);
  }

  private buildSearchWhereSql(
    termGroups: string[][],
    brand?: string,
    categoryId?: string,
    tier?: ProductTier,
  ): Prisma.Sql {
    // Only live offers count: a product's price filter, price sort and
    // listing count use the same offers its card and page show (L-15).
    const conditions: Prisma.Sql[] = [liveOfferSql('sl', this.offerPolicy())];
    const title = normalizedTextSql(Prisma.sql`cp.title`);

    // Every term must match; a term matches through any of its alternatives
    // (the Arabic-normalized word or an English spelling of it).
    for (const alternatives of termGroups) {
      const matches = alternatives.map((term) => {
        const pattern = `%${escapeLike(term)}%`;
        return Prisma.sql`(
          ${title} LIKE ${pattern} OR
          cp.normalized_title LIKE ${pattern} OR
          cp.brand ILIKE ${pattern} OR
          cp.model ILIKE ${pattern} OR
          cp.slug ILIKE ${pattern} OR
          EXISTS (SELECT 1 FROM unnest(string_to_array(lower(c.name), ' ')) tok WHERE tok = ${term}) OR
          EXISTS (SELECT 1 FROM unnest(c.search_terms) st WHERE st ILIKE ${pattern})
        )`;
      });
      conditions.push(Prisma.sql`(${Prisma.join(matches, ' OR ')})`);
    }

    if (brand) {
      conditions.push(Prisma.sql`cp.brand ILIKE ${escapeLike(brand)}`);
    }
    if (categoryId) {
      conditions.push(Prisma.sql`cp.category_id = ${categoryId}`);
    }
    if (tier) {
      conditions.push(Prisma.sql`cp.tier = ${tier}::"ProductTier"`);
    }

    return Prisma.join(conditions, ' AND ');
  }

  private buildHavingSql(minPrice?: number, maxPrice?: number): Prisma.Sql {
    const parts: Prisma.Sql[] = [];
    if (minPrice != null) {
      parts.push(Prisma.sql`MIN(sl.price_usd) >= ${minPrice}`);
    }
    if (maxPrice != null) {
      parts.push(Prisma.sql`MAX(sl.price_usd) <= ${maxPrice}`);
    }
    return parts.length ? Prisma.sql`HAVING ${Prisma.join(parts, ' AND ')}` : Prisma.empty;
  }

  private buildOrderBySql(
    sortBy: SearchSortBy,
    sortDir: SearchSortDir,
    relevanceSql: Prisma.Sql,
    normalizedQuery = '',
  ): Prisma.Sql {
    if (sortBy === 'relevance' && !normalizedQuery) {
      // Browsing with no query: relevance is the same for everything, so show
      // the products compared across the most stores first rather than the
      // cheapest (which surfaced a page of $2 earphones).
      return Prisma.sql`COUNT(DISTINCT sl.platform_id) DESC, COUNT(sl.id) DESC, cp.updated_at DESC`;
    }
    if (sortBy === 'relevance') {
      const direction = sortDir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
      return Prisma.sql`MAX(${relevanceSql}) ${direction}, MIN(sl.price_usd) ASC NULLS LAST, cp.updated_at DESC`;
    }

    const column = {
      minPriceUsd: Prisma.sql`MIN(sl.price_usd)`,
      maxPriceUsd: Prisma.sql`MAX(sl.price_usd)`,
      listingCount: Prisma.sql`COUNT(sl.id)`,
      updatedAt: Prisma.sql`cp.updated_at`,
    }[sortBy];

    const direction = sortDir === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    return Prisma.sql`${column} ${direction} NULLS LAST, cp.updated_at DESC`;
  }

  /**
   * Titles like "iPhone 17" satisfy `ILIKE '%phone%'` purely because "iPhone"
   * contains that substring — so a case titled "... for iPhone 17 ..." scores
   * the same as the phone itself on title match, then wins on the price
   * tie-break for being cheaper. Demoting known accessory nouns (unless the
   * query itself asks for one) keeps the base product above its accessories
   * for any category, not just phones.
   */
  private static readonly ACCESSORY_KEYWORDS = [
    'case', 'cover', 'protector', 'skin', 'pod', 'bumper', 'sleeve', 'pouch',
    'stand', 'mount', 'strap', 'charger', 'cable', 'tempered glass', 'screen guard',
    // A console search should show the console before its gamepads.
    'controller', 'gamepad',
  ];

  /**
   * Weighted relevance score for ranking search hits. Without this, results were
   * ordered purely by price, so a cheap unrelated accessory (e.g. a phone case
   * matching "phone" only through its category) would outrank an actual phone.
   * Title matches are weighted far above category/search-term matches so that
   * loosely-related category matches sink instead of dominating page one.
   */
  private buildRelevanceScoreSql(termGroups: string[][], normalizedQuery: string): Prisma.Sql {
    if (termGroups.length === 0) {
      return Prisma.sql`0`;
    }
    const title = normalizedTextSql(Prisma.sql`cp.title`);

    // A term scores through its best alternative, so an Arabic word and its
    // English spelling never count twice.
    const termScores = termGroups.map((alternatives) =>
      Prisma.sql`GREATEST(${Prisma.join(
        alternatives.map((term) => this.termScoreSql(term, title)),
        ', ',
      )})`,
    );

    // The full-phrase bonus checks both the query as typed (normalized) and
    // its English-spelled form.
    const phrases = Array.from(
      new Set([termGroups.map((alternatives) => alternatives[0]).join(' '), searchPhrase(termGroups)]),
    );
    const fullPhraseBonus = Prisma.sql`GREATEST(${Prisma.join(
      phrases.map(
        (phrase) => Prisma.sql`(
          CASE
            WHEN ${title} LIKE ${escapeLike(phrase)} THEN 50
            WHEN ${title} LIKE ${`${escapeLike(phrase)}%`} THEN 20
            WHEN ${title} LIKE ${`%${escapeLike(phrase)}%`} THEN 8
            ELSE 0
          END
        )`,
      ),
      ', ',
    )})`;

    const englishQuery = `${normalizedQuery} ${searchPhrase(termGroups)}`;
    const queryAsksForAccessory = SearchService.ACCESSORY_KEYWORDS.some((keyword) =>
      englishQuery.includes(keyword),
    );
    const accessoryPenalty = queryAsksForAccessory
      ? Prisma.sql`0`
      : Prisma.sql`(CASE WHEN ${Prisma.join(
          SearchService.ACCESSORY_KEYWORDS.map((keyword) => Prisma.sql`cp.title ILIKE ${`%${keyword}%`}`),
          ' OR ',
        )} THEN -20 ELSE 0 END)`;

    return Prisma.sql`(${fullPhraseBonus} + ${accessoryPenalty} + ${Prisma.join(termScores, ' + ')})`;
  }

  private termScoreSql(term: string, title: Prisma.Sql): Prisma.Sql {
    const contains = `%${escapeLike(term)}%`;
    const startsWith = `${escapeLike(term)}%`;
    return Prisma.sql`(
        CASE
          WHEN ${title} LIKE ${startsWith} OR cp.normalized_title LIKE ${startsWith} THEN 12
          WHEN ${title} LIKE ${contains} OR cp.normalized_title LIKE ${contains} THEN 6
          ELSE 0
        END +
        CASE
          WHEN cp.brand ILIKE ${escapeLike(term)} THEN 10
          WHEN cp.brand ILIKE ${contains} THEN 4
          ELSE 0
        END +
        CASE WHEN cp.model ILIKE ${contains} THEN 6 ELSE 0 END +
        CASE
          WHEN EXISTS (SELECT 1 FROM unnest(string_to_array(lower(c.name), ' ')) tok WHERE tok = ${term}) THEN 5
          ELSE 0
        END +
        CASE
          WHEN EXISTS (SELECT 1 FROM unnest(c.search_terms) st WHERE st ILIKE ${contains}) THEN 2
          ELSE 0
        END
      )`;
  }


  /** Per-query cooldown so repeat searches (pagination, sorting, retyping) don't re-scrape. */
  private static readonly LIVE_FETCH_COOLDOWN_MS = 30 * 1000;
  private readonly lastLiveFetchAt = new Map<string, number>();

  /**
   * Queues a background job that searches connectors for what the user actually typed,
   * instead of blocking the search request on it. Results are served from the DB
   * immediately while this refreshes prices/products from the retailer APIs. The jobId
   * dedups concurrent triggers for the same query — Bull returns the existing job instead
   * of piling up duplicate scrapes while one is in flight — and the cooldown map skips
   * queries that were already refreshed recently.
   */
  private async triggerOnDemandLiveFetch(query: string): Promise<boolean> {
    const lastRun = this.lastLiveFetchAt.get(query);
    if (lastRun != null && Date.now() - lastRun < SearchService.LIVE_FETCH_COOLDOWN_MS) {
      return false;
    }

    try {
      await this.ingestionQueue.enqueueQueryIngestion(query, 12);
      this.lastLiveFetchAt.set(query, Date.now());
      return true;
    } catch {
      return false;
    }
  }
}
