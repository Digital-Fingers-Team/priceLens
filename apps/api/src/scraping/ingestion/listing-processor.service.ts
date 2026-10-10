import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus } from '@prisma/client';
import type { Category, Platform } from '@prisma/client';
import { FuzzyMatcherService } from '../../matching/fuzzy-matcher.service';
import { FxRatesService } from '../../matching/fx-rates.service';
import { NormalizerService } from '../../matching/normalizer.service';
import { SemanticService } from '../../matching/semantic.service';
import {
  AWAITING_JUDGE,
  MATCHED_CONFIDENCE,
  MatchingTools,
  NEW_PRODUCT_CONFIDENCE,
  NormalizedListing,
  SameProductJudge,
  checkCategorySanity,
  checkConflicts,
  checkMarketOutlier,
  detectJunkListing,
  findCanonicalMatch,
  isBelowPriceFloor,
  listingKeys,
  priceFloorFor,
  normalizeListing,
  toBasePrices,
} from '../../matching/pipeline';
import { PHONE_ACCESSORIES_SLUG, isPhoneAccessory } from '../../matching/text/phone-accessory';
import type { RetailerListing } from '../interfaces/retailer-listing.interface';
import { KeyedMutex } from '../../common/keyed-mutex';
import { IngestionRepository } from './ingestion.repository';
import { buildRawAttributes, inferTier, toDbDecimal, toJson, toSlug } from './listing-mapping';
import { pickCategoryForQuery } from './search-queries';

const DEFAULT_MIN_LISTING_PRICE_EGP = 5000;

/** Declines every ambiguous pair, so only rule-based matches go through. */
const NO_JUDGE: SameProductJudge = { judgeSameProduct: async () => null };

export interface ProcessedListing {
  createdCanonicalProduct: boolean;
  matchedExistingCanonicalProduct: boolean;
  priceHistoryCreated: boolean;
  canonicalProductId: string;
}

/**
 * Takes one scraped listing through matching pipeline steps 2-10 and
 * persists the outcome: the listing row, a new product when it founds one,
 * a price-history point and the match decision. Step 1 (price gate) runs in
 * the caller, before a listing is counted as discovered.
 *
 * Returns null when the listing is rejected (and marks an earlier-accepted
 * copy of it REJECTED).
 */
@Injectable()
export class ListingProcessor {
  private readonly logger = new Logger(ListingProcessor.name);
  private readonly tools: MatchingTools;
  /**
   * Serializes matching + persisting per product family (brand, model or
   * title; not category, since step 7a looks across categories). Two jobs that scrape the same new product at once would
   * otherwise both find no match and both create it (audit 02, L-19).
   */
  private readonly familyLock = new KeyedMutex();
  /** MIN_LISTING_PRICE_EGP; a category's own min_price_egp overrides it. */
  private readonly globalFloor: number;
  /** Listings dropped by the price floor since the last take: store slug -> category slug -> count. */
  private readonly belowFloor = new Map<string, Map<string, number>>();

  constructor(
    private readonly repository: IngestionRepository,
    private readonly fxRates: FxRatesService,
    private readonly semantic: SemanticService,
    normalizer: NormalizerService,
    fuzzy: FuzzyMatcherService,
    @Optional() config?: ConfigService,
  ) {
    this.tools = { normalizer, fuzzy };
    this.globalFloor = config?.get<number>('retailers.minListingPriceEgp', DEFAULT_MIN_LISTING_PRICE_EGP) ?? DEFAULT_MIN_LISTING_PRICE_EGP;
  }

  /** What the floor dropped for this store since the last call, in total and per category; resets it. */
  takeBelowFloor(platformSlug: string): { total: number; byCategory: Record<string, number> } {
    const counts = this.belowFloor.get(platformSlug) ?? new Map<string, number>();
    this.belowFloor.delete(platformSlug);
    const byCategory = Object.fromEntries(counts);
    return { total: [...counts.values()].reduce((sum, n) => sum + n, 0), byCategory };
  }

  async process(
    platform: Platform,
    category: Category,
    listing: RetailerListing,
    sourceSlug: string,
  ): Promise<ProcessedListing | null> {
    // Step 2: junk filter.
    const junk = detectJunkListing(listing.title);
    if (junk) {
      await this.reject(platform, listing, junk);
      return null;
    }

    // Step 3: normalize and extract.
    const input = normalizeListing(listing, this.tools);

    // Step 4: currency. `rawPrice`/`rawCurrency` keep the store's own amount.
    const { price, advertisedPrice } = await toBasePrices(listing, (amount, currency) =>
      this.fxRates.convert(amount, currency),
    );
    if (listing.priceUsd != null && price == null) {
      await this.reject(platform, listing, `no exchange rate for ${listing.currency}`);
      return null;
    }

    // Step 4b: price floor. A listing under it may still update a product we
    // already track (its price fell, or another store sells it cheaper), so
    // it is matched -- without the LLM judge -- and only dropped when it
    // would found a new product. Dropped listings write no row: they are the
    // bulk of every broad sweep, and a REJECTED row for each would be noise.
    const belowFloor = isBelowPriceFloor(price, priceFloorFor(category, this.globalFloor));

    // Step 5: category sanity.
    if (price != null) {
      const categoryMedian = await this.repository.categoryMedianPrice(category.id);
      const insane = checkCategorySanity(
        { title: listing.title, price, categoryName: category.name, categoryMedian },
        this.tools,
      );
      if (insane) {
        if (belowFloor) return this.dropBelowFloor(platform, category);
        await this.reject(platform, listing, insane);
        return null;
      }
    }

    const home = await this.homeCategory(category, listing.title);
    if (!home) {
      this.logger.debug(`Skipping "${listing.title}" from ${platform.slug}: not a phone accessory and no category fits its title`);
      return null;
    }
    const keys = listingKeys(input);
    const family = [keys.brand ?? '', keys.model ?? input.normalized.normalized].join('|');
    return this.familyLock.run(family, () =>
      this.matchAndPersist(platform, home, listing, sourceSlug, input, price, advertisedPrice, belowFloor),
    );
  }

  /**
   * The category a listing's product belongs in. Normally the one whose sweep
   * found it; a phone case or screen protector goes to Phone Accessories
   * whichever sweep found it (headphone and smart-watch searches return them
   * by the thousand), so every copy of it meets in one place. The sanity and
   * price-floor checks above still use the sweep's category.
   *
   * Phone Accessories is never swept (retired); listings only reach it when a
   * product filed there (a FreeBuds case) is searched at the other stores, and
   * those searches return the devices themselves. Such a listing goes to the
   * leaf its title names, or is skipped when none does: on 2026-10-10, 390
   * earbuds sat in Phone Accessories, 63 of them created that week.
   */
  private async homeCategory(sweepCategory: Category, title: string): Promise<Category | null> {
    if (sweepCategory.slug === PHONE_ACCESSORIES_SLUG) {
      if (isPhoneAccessory(title)) return sweepCategory;
      const leaves = (await this.repository.findLeafCategories()).filter((leaf) => (leaf.rolloutWave ?? 0) >= 0);
      return pickCategoryForQuery(title, leaves);
    }
    if (!isPhoneAccessory(title)) return sweepCategory;
    return (await this.repository.categoryBySlug(PHONE_ACCESSORIES_SLUG)) ?? sweepCategory;
  }

  /**
   * The product this listing is already attached to, when it still passes
   * the step 8 guards (a store can reuse an id for something else). A listing
   * seen again is not re-matched: matching it afresh in another sweep's
   * category used to miss its product and found a duplicate.
   */
  private async currentProduct(platform: Platform, listing: RetailerListing, input: NormalizedListing<RetailerListing>) {
    const current = await this.repository.currentProductOf(platform.id, listing.externalId);
    if (!current || checkConflicts(input, current, this.tools).conflict !== null) return null;
    return current;
  }

  private dropBelowFloor(platform: Platform, category: Category): null {
    const counts = this.belowFloor.get(platform.slug) ?? new Map<string, number>();
    counts.set(category.slug, (counts.get(category.slug) ?? 0) + 1);
    this.belowFloor.set(platform.slug, counts);
    return null;
  }

  private async matchAndPersist(
    platform: Platform,
    category: Category,
    listing: RetailerListing,
    sourceSlug: string,
    input: NormalizedListing<RetailerListing>,
    price: number | null,
    advertisedPrice: number | null,
    belowFloor = false,
  ): Promise<ProcessedListing | null> {
    // Steps 6-9: the product it belongs to, if any. A below-floor listing
    // does not get the (paid) LLM judge: most are accessories and cheap
    // look-alikes, and only a clear match is worth keeping.
    const found =
      (await this.currentProduct(platform, listing, input)) ??
      (await findCanonicalMatch(
        input,
        category.id,
        { candidates: this.repository.candidates, judge: belowFloor ? NO_JUDGE : this.semantic },
        this.tools,
      ));
    // No product is added before the AI judge has ruled on its look-alikes
    // (owner decision, 2026-10-09): while it cannot answer (quota spent), the
    // listing is not stored and a later sweep tries again. Phone cases and
    // protectors are never sent to the judge, so they still found their own.
    if (found === AWAITING_JUDGE && !belowFloor && !isPhoneAccessory(listing.title)) {
      this.logger.debug(`Holding "${listing.title}" from ${platform.slug} until the AI judge answers`);
      return null;
    }
    const match = found === AWAITING_JUDGE ? null : found;
    if (match && match.categoryId !== category.id && category.slug === PHONE_ACCESSORIES_SLUG) {
      await this.repository.moveProductToCategory(match.id, category.id);
    }
    if (!match && belowFloor) {
      return this.dropBelowFloor(platform, category);
    }

    // Step 10: market outlier. Such a listing is not attached to the product,
    // and not turned into a product of its own either: its title says it is
    // this product, so a new one would just duplicate it with a bad price.
    if (match && price != null) {
      const others = await this.repository.otherAcceptedOffers(match.id, platform.id, listing.externalId);
      const { outlier, median } = checkMarketOutlier({ price, store: platform.id }, others);
      if (outlier) {
        await this.reject(platform, listing, `price ${price} is far from the ${median} median of "${match.title}"`);
        return null;
      }
    }

    const product = match ?? (await this.createProduct(category, input));
    const confidence = match ? MATCHED_CONFIDENCE : NEW_PRODUCT_CONFIDENCE;

    const sourceListing = await this.repository.upsertSourceListing(platform.id, listing.externalId, {
      canonicalProductId: product.id,
      externalUrl: listing.externalUrl,
      rawTitle: listing.title,
      rawPrice: toDbDecimal(listing.priceUsd),
      rawCurrency: listing.currency,
      rawBrand: listing.brand,
      rawImageUrl: listing.imageUrl,
      rawAttributes: toJson(buildRawAttributes(listing, sourceSlug)),
      rawCategory: category.name,
      normalizedTitle: input.normalized.normalized,
      extractedGtin: listing.identifiers.gtin,
      extractedUpc: listing.identifiers.upc,
      extractedEan: listing.identifiers.ean,
      extractedMpn: listing.identifiers.mpn,
      extractedBrand: input.extracted.brand ?? listing.brand,
      extractedModel: input.extracted.model ?? listing.model,
      extractedAttributes: toJson(input.extracted),
      priceUsd: toDbDecimal(price),
      advertisedPrice: toDbDecimal(advertisedPrice),
      inStock: listing.inStock,
      rating: listing.rating,
      reviewCount: listing.reviewCount,
      matchStatus: MatchStatus.ACCEPTED,
      matchConfidence: confidence,
      matchedAt: new Date(),
      lastSeenAt: new Date(),
      lastScrapedAt: new Date(),
    });

    // A product founded by a listing without a photo picks one up from the
    // next listing that has it (AliExpress cards lost theirs for a while).
    if (match && !match.imageUrl && listing.imageUrl) {
      await this.repository.fillMissingProductImage(product.id, listing.imageUrl);
    }

    const priceHistoryCreated = await this.appendPriceHistory(sourceListing.id, product.id, listing, price);

    await this.repository.recordMatchDecision({
      sourceListingId: sourceListing.id,
      candidateId: product.id,
      status: MatchStatus.ACCEPTED,
      confidence,
      engineVersion: `live-ingestion-${sourceSlug}-v1`,
      scores: toJson({
        strategy: match ? 'exact-match' : 'new-canonical-product',
        source: sourceSlug,
      }),
      reasoning: match
        ? 'Matched by exact identifier or conservative canonical title comparison.'
        : 'Created a new canonical product because no exact-safe match was found.',
      flags: [],
    });

    return {
      createdCanonicalProduct: !match,
      matchedExistingCanonicalProduct: !!match,
      priceHistoryCreated,
      canonicalProductId: product.id,
    };
  }

  /**
   * Step 1 dropped this listing for having no usable price. When the store
   * says it is sold out, the stored copy (if any) must learn that, or its
   * last price keeps being shown as available (audit 02, L-11). A priceless
   * listing with no stock signal is left alone: that is a scrape error more
   * often than not, and the offer age window retires it if it persists.
   */
  async recordUnpriced(platform: Platform, listing: RetailerListing): Promise<void> {
    if (listing.inStock !== false) return;
    const count = await this.repository.markOutOfStock(platform.id, listing.externalId);
    if (count) this.logger.log(`"${listing.title}" on ${platform.slug} is sold out`);
  }

  /**
   * Drops a listing ingestion refuses to attach. One stored by an earlier run
   * is marked REJECTED rather than left in place: the upsert re-accepts every
   * listing it sees, so without this a listing that only fails a check now
   * would keep its old ACCEPTED match and keep being shown.
   */
  private async reject(platform: Platform, listing: RetailerListing, reason: string): Promise<void> {
    const count = await this.repository.rejectStoredListing(platform.id, listing.externalId);
    this.logger.log(
      `Rejected "${listing.title}" from ${platform.slug}: ${reason}${count ? ' (was previously accepted)' : ''}`,
    );
  }

  private createProduct(category: Category, { listing, normalized, extracted }: NormalizedListing<RetailerListing>) {
    const baseSlug = toSlug(
      [listing.brand ?? extracted.brand, listing.model ?? extracted.model, listing.title].filter(Boolean).join(' '),
    );

    return this.repository.createCanonicalProduct({
      baseSlug: baseSlug || `product-${listing.externalId}`,
      categoryId: category.id,
      title: listing.title,
      normalizedTitle: normalized.normalized,
      brand: listing.brand ?? extracted.brand ?? null,
      model: listing.model ?? extracted.model ?? null,
      gtin: listing.identifiers.gtin ?? null,
      upc: listing.identifiers.upc ?? null,
      ean: listing.identifiers.ean ?? null,
      mpn: listing.identifiers.mpn ?? null,
      attributes: toJson(extracted),
      imageUrl: listing.imageUrl ?? null,
      thumbnailUrl: listing.imageUrl ?? null,
      tier: inferTier(listing.priceUsd ?? null),
      isVerified: false,
    });
  }

  /**
   * `priceUsd`/`currency` are the base-currency values, so the price-history
   * chart can aggregate across stores in different currencies.
   * `originalPrice` keeps the store's raw amount.
   */
  private async appendPriceHistory(
    sourceListingId: string,
    canonicalProductId: string,
    listing: RetailerListing,
    price: number | null,
  ): Promise<boolean> {
    const priceUsd = toDbDecimal(price);
    if (!priceUsd) {
      return false;
    }
    return this.repository.appendPriceHistoryIfChanged({
      sourceListingId,
      canonicalProductId,
      priceUsd,
      currency: this.fxRates.base,
      originalPrice: toDbDecimal(listing.priceUsd),
      inStock: listing.inStock ?? true,
    });
  }
}
