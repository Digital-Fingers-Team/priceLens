import { Injectable, Logger } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import type { Category, Platform } from '@prisma/client';
import { FuzzyMatcherService } from '../../matching/fuzzy-matcher.service';
import { FxRatesService } from '../../matching/fx-rates.service';
import { NormalizerService } from '../../matching/normalizer.service';
import { SemanticService } from '../../matching/semantic.service';
import {
  MATCHED_CONFIDENCE,
  MatchingTools,
  NEW_PRODUCT_CONFIDENCE,
  NormalizedListing,
  checkCategorySanity,
  checkMarketOutlier,
  detectJunkListing,
  findCanonicalMatch,
  normalizeListing,
  toBasePrices,
} from '../../matching/pipeline';
import type { RetailerListing } from '../interfaces/retailer-listing.interface';
import { IngestionRepository } from './ingestion.repository';
import { buildRawAttributes, inferTier, toDbDecimal, toJson, toSlug } from './listing-mapping';

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

  constructor(
    private readonly repository: IngestionRepository,
    private readonly fxRates: FxRatesService,
    private readonly semantic: SemanticService,
    normalizer: NormalizerService,
    fuzzy: FuzzyMatcherService,
  ) {
    this.tools = { normalizer, fuzzy };
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

    // Step 5: category sanity.
    if (price != null) {
      const categoryMedian = await this.repository.categoryMedianPrice(category.id);
      const insane = checkCategorySanity(
        { title: listing.title, price, categoryName: category.name, categoryMedian },
        this.tools,
      );
      if (insane) {
        await this.reject(platform, listing, insane);
        return null;
      }
    }

    // Steps 6-9: the product it belongs to, if any.
    const match = await findCanonicalMatch(
      input,
      category.id,
      { candidates: this.repository.candidates, judge: this.semantic },
      this.tools,
    );

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
