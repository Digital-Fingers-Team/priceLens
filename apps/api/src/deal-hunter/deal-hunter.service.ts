import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OfferPolicy, liveOfferWhere } from '../prices/offer-rules';
import { PriceIntelligenceService } from '../intelligence/price-intelligence.service';
import { computeDealScore } from '../intelligence/deal-score';
import { computeHistoryStats } from '../intelligence/price-statistics';
import { ParsedQuery, SpecConstraint, parseQuery } from './constraint-parser';

/** How many candidates to score. Scoring costs a query each, so it is capped. */
const MAX_CANDIDATES = 40;

export interface DealHunterMatch {
  productId: string;
  slug: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  categoryName: string;
  price: number | null;
  currency: string;
  storeCount: number;
  inStock: boolean | null;
  dealScore: number | null;
  dealGrade: string | null;
  /** 0-100: how well this satisfies what was actually asked for. */
  matchScore: number;
  /** Specs asked for that this product demonstrably has. */
  specsMatched: SpecConstraint[];
  /** Specs asked for that we could not confirm either way. */
  specsUnconfirmed: SpecConstraint[];
  /** Plain-language, data-backed reasons this is being shown. */
  reasons: string[];
}

export interface DealHunterResult {
  query: string;
  parsed: ParsedQuery;
  /** What we understood, in words, so the user can correct it. */
  interpretation: string;
  matches: DealHunterMatch[];
  totalCandidates: number;
  currency: string;
  /** Set when the search could not be run meaningfully. */
  notice: string | null;
}

/**
 * Finds the best product for a described need.
 *
 * The ranking is data-first: constraint satisfaction decides *which* products
 * qualify, and the existing deal-score signals decide which of them is
 * actually worth buying. No language model is involved -- the explanations are
 * generated from the same numbers the score is built from, so they cannot
 * disagree with the data.
 */
@Injectable()
export class DealHunterService {
  private readonly logger = new Logger(DealHunterService.name);
  private readonly currency: string;
  private readonly offerPolicy: OfferPolicy;

  constructor(
    private readonly prisma: PrismaService,
    private readonly intelligence: PriceIntelligenceService,
    config: ConfigService,
  ) {
    this.currency = config.get<string>('pricing.fxBaseCurrency', 'EGP');
    this.offerPolicy = { maxAgeDays: config.get<number>('pricing.offerMaxAgeDays', 7) };
  }

  async hunt(rawQuery: string, limit = 10): Promise<DealHunterResult> {
    const parsed = parseQuery(rawQuery);

    if (parsed.isEmpty) {
      return {
        query: rawQuery,
        parsed,
        interpretation: 'We could not make out what you are looking for.',
        matches: [],
        totalCandidates: 0,
        currency: this.currency,
        notice: 'Try naming a product type and a budget, for example "laptop under 40,000 EGP with RTX 4060".',
      };
    }

    const candidates = await this.findCandidates(parsed);

    if (candidates.length === 0) {
      return {
        query: rawQuery,
        parsed,
        interpretation: this.describe(parsed),
        matches: [],
        totalCandidates: 0,
        currency: this.currency,
        notice:
          'Nothing in the catalogue matches all of that yet. Try widening the budget or dropping a requirement.',
      };
    }

    const scored = await Promise.all(candidates.map((candidate) => this.score(candidate, parsed)));

    // Constraint satisfaction first, value second: a cheap product that is not
    // what was asked for is not a better answer than the right product.
    scored.sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      const aScore = a.dealScore ?? -1;
      const bScore = b.dealScore ?? -1;
      if (bScore !== aScore) return bScore - aScore;
      return (a.price ?? Infinity) - (b.price ?? Infinity);
    });

    return {
      query: rawQuery,
      parsed,
      interpretation: this.describe(parsed),
      matches: scored.slice(0, Math.min(Math.max(limit, 1), 25)),
      totalCandidates: candidates.length,
      currency: this.currency,
      notice: null,
    };
  }

  /**
   * Hard filters only -- category, brand and price. Specs are applied as
   * ranking signals rather than filters because attribute extraction is
   * incomplete: filtering on a spec we simply failed to parse would hide
   * products that genuinely match.
   */
  private async findCandidates(parsed: ParsedQuery) {
    const where: Prisma.CanonicalProductWhereInput = {
      sourceListings: {
        some: liveOfferWhere(this.offerPolicy),
      },
    };

    if (parsed.categorySlugs.length > 0) {
      where.category = { slug: { in: parsed.categorySlugs } };
    }

    if (parsed.brands.length > 0) {
      where.OR = parsed.brands.map((brand) => ({
        brand: { contains: brand, mode: 'insensitive' as const },
      }));
    }

    const textTerms = [parsed.unparsed, ...parsed.specs.map((spec) => spec.value)]
      .join(' ')
      .trim();

    if (textTerms) {
      const AND: Prisma.CanonicalProductWhereInput[] = [];
      // Every distinctive term must appear somewhere in the title. Products
      // are matched on their own titles rather than a search index so the
      // spec terms ("RTX 4060") are checked against the actual product name.
      for (const term of textTerms.split(/\s+/).filter((t) => t.length >= 2).slice(0, 6)) {
        AND.push({ title: { contains: term, mode: 'insensitive' } });
      }
      if (AND.length > 0) where.AND = AND;
    }

    const products = await this.prisma.canonicalProduct.findMany({
      where,
      select: {
        id: true,
        slug: true,
        title: true,
        brand: true,
        imageUrl: true,
        attributes: true,
        category: { select: { name: true } },
        sourceListings: {
          // Live offers only: the same rule as the product page (offer-rules).
          where: liveOfferWhere(this.offerPolicy),
          select: { priceUsd: true, inStock: true, platformId: true },
          orderBy: { priceUsd: 'asc' },
        },
      },
      take: MAX_CANDIDATES * 3,
    });

    // Price is filtered here rather than in SQL because the comparable price
    // is the cheapest live listing, which is not a column on the product.
    const withinBudget = products.filter((product) => {
      const best = product.sourceListings[0]?.priceUsd;
      if (best == null) return false;
      const price = Number(best);
      if (parsed.price.min != null && price < parsed.price.min) return false;
      if (parsed.price.max != null && price > parsed.price.max) return false;
      return true;
    });

    return withinBudget.slice(0, MAX_CANDIDATES);
  }

  private async score(
    product: Awaited<ReturnType<DealHunterService['findCandidates']>>[number],
    parsed: ParsedQuery,
  ): Promise<DealHunterMatch> {
    const prices = product.sourceListings
      .map((listing) => Number(listing.priceUsd))
      .filter((value) => Number.isFinite(value) && value > 0);

    const best = prices[0] ?? null;
    const storeCount = new Set(product.sourceListings.map((listing) => listing.platformId)).size;
    const inStock = product.sourceListings[0]?.inStock ?? null;

    // Competitor prices are one per store, so a store listing many variants
    // cannot skew the distribution.
    const perStore = new Map<string, number>();
    for (const listing of product.sourceListings) {
      const price = Number(listing.priceUsd);
      const current = perStore.get(listing.platformId);
      if (current == null || price < current) perStore.set(listing.platformId, price);
    }

    const points = await this.intelligence.getDailySeries(product.id, 90);
    const stats = computeHistoryStats(points);

    const deal = computeDealScore({
      currentPrice: best,
      points,
      stats,
      competitorPrices: [...perStore.values()],
      inStock,
      storeCount,
    });

    const { matched, unconfirmed } = this.matchSpecs(product, parsed.specs);

    // Constraint satisfaction. Specs we could not confirm neither help nor
    // punish -- absence of evidence is not evidence of absence, and the UI
    // says which ones we could not verify.
    const specTotal = parsed.specs.length;
    const specScore = specTotal === 0 ? 1 : (matched.length + 0.5 * unconfirmed.length) / specTotal;

    const brandScore =
      parsed.brands.length === 0
        ? 1
        : parsed.brands.some((brand) => (product.brand ?? '').toLowerCase().includes(brand))
          ? 1
          : 0.5;

    const matchScore = Math.round(specScore * 70 + brandScore * 30);

    return {
      productId: product.id,
      slug: product.slug,
      title: product.title,
      brand: product.brand,
      imageUrl: product.imageUrl,
      categoryName: product.category.name,
      price: best,
      currency: this.currency,
      storeCount,
      inStock,
      dealScore: deal.score,
      dealGrade: deal.grade,
      matchScore,
      specsMatched: matched,
      specsUnconfirmed: unconfirmed,
      reasons: this.explain(best, parsed, matched, unconfirmed, deal, stats, storeCount, perStore.size),
    };
  }

  /**
   * Checks each requested spec against the product's extracted attributes,
   * falling back to its title.
   *
   * Three outcomes, not two: matched, contradicted (dropped), and unconfirmed.
   * Collapsing "we cannot tell" into "does not match" would hide good products
   * whose attributes we simply failed to parse.
   */
  private matchSpecs(
    product: { title: string; attributes: Prisma.JsonValue },
    specs: SpecConstraint[],
  ): { matched: SpecConstraint[]; unconfirmed: SpecConstraint[] } {
    const attributes = (product.attributes ?? {}) as Record<string, unknown>;
    const title = product.title.toLowerCase();

    const matched: SpecConstraint[] = [];
    const unconfirmed: SpecConstraint[] = [];

    for (const spec of specs) {
      const attributeValue = attributes[spec.field];
      const needle = spec.value.toLowerCase();

      if (typeof attributeValue === 'string' && attributeValue.length > 0) {
        if (attributeValue.toLowerCase().includes(needle)) matched.push(spec);
        else unconfirmed.push(spec);
        continue;
      }

      // No extracted attribute: fall back to the title, ignoring spacing so
      // "RTX 4060" matches "RTX4060".
      const compact = needle.replace(/\s+/g, '');
      if (title.includes(needle) || title.replace(/\s+/g, '').includes(compact)) matched.push(spec);
      else unconfirmed.push(spec);
    }

    return { matched, unconfirmed };
  }

  private explain(
    price: number | null,
    parsed: ParsedQuery,
    matched: SpecConstraint[],
    unconfirmed: SpecConstraint[],
    deal: ReturnType<typeof computeDealScore>,
    stats: ReturnType<typeof computeHistoryStats>,
    storeCount: number,
    competitorCount: number,
  ): string[] {
    const reasons: string[] = [];
    const money = (value: number) => `${Math.round(value).toLocaleString('en-US')} ${this.currency}`;

    if (price != null && parsed.price.max != null) {
      const headroom = parsed.price.max - price;
      reasons.push(
        headroom > 0
          ? `${money(price)} — ${money(headroom)} under your budget.`
          : `${money(price)}, right at your budget.`,
      );
    } else if (price != null) {
      reasons.push(`Cheapest live price is ${money(price)}.`);
    }

    if (matched.length > 0) {
      reasons.push(`Matches ${matched.map((spec) => spec.value).join(', ')}.`);
    }
    if (unconfirmed.length > 0) {
      // Said plainly rather than hidden: this is the difference between a
      // recommendation and a guess.
      reasons.push(
        `We could not confirm ${unconfirmed.map((spec) => spec.value).join(', ')} from the listing data.`,
      );
    }

    if (competitorCount >= 2) {
      reasons.push(`Compared across ${storeCount} store(s) carrying it.`);
    } else {
      reasons.push('Only one store currently carries this, so the price is harder to sanity-check.');
    }

    if (stats && deal.score != null) {
      const historical = deal.signals.find((signal) => signal.key === 'historicalPosition');
      if (historical?.available) reasons.push(historical.detail);
    } else if (!stats) {
      reasons.push('No recorded price history yet, so we cannot say whether this is a good moment to buy.');
    }

    return reasons;
  }

  private describe(parsed: ParsedQuery): string {
    const parts: string[] = [];

    if (parsed.categorySlugs.length > 0) {
      parts.push(parsed.categorySlugs.map((slug) => slug.replace(/-/g, ' ')).join(' or '));
    } else if (parsed.unparsed) {
      parts.push(`products matching "${parsed.unparsed}"`);
    } else {
      parts.push('products');
    }

    if (parsed.brands.length > 0) parts.push(`from ${parsed.brands.join(' or ')}`);
    if (parsed.specs.length > 0) parts.push(`with ${parsed.specs.map((spec) => spec.value).join(', ')}`);

    if (parsed.price.min != null && parsed.price.max != null) {
      parts.push(`between ${parsed.price.min.toLocaleString()} and ${parsed.price.max.toLocaleString()} ${this.currency}`);
    } else if (parsed.price.max != null) {
      parts.push(`under ${parsed.price.max.toLocaleString()} ${this.currency}`);
    } else if (parsed.price.min != null) {
      parts.push(`over ${parsed.price.min.toLocaleString()} ${this.currency}`);
    }

    return `Looking for ${parts.join(' ')}.`;
  }
}
