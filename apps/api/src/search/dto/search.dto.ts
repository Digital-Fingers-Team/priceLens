import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { ProductTier } from '@prisma/client';

export const SEARCH_SORT_BY = ['relevance', 'minPriceUsd', 'maxPriceUsd', 'listingCount', 'updatedAt'] as const;
export type SearchSortBy = (typeof SEARCH_SORT_BY)[number];
export const SEARCH_SORT_DIR = ['asc', 'desc'] as const;
export type SearchSortDir = (typeof SEARCH_SORT_DIR)[number];

/** Longest query we accept. Every search with a query queues a scrape keyed by it. */
export const MAX_QUERY_LENGTH = 200;

/** GET /search */
export class SearchQueryDto {
  /** What the user typed. Empty lists the catalog, most-compared products first. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_QUERY_LENGTH)
  q?: string;

  /** Exact brand, case-insensitive. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(ProductTier)
  tier?: ProductTier;

  /** Lowest live offer at or above this, in the base currency. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  minPrice?: number;

  /** Highest live offer at or below this, in the base currency. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsIn(SEARCH_SORT_BY)
  sortBy?: SearchSortBy;

  @IsOptional()
  @IsIn(SEARCH_SORT_DIR)
  sortDir?: SearchSortDir;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** GET /search/suggest */
export class SuggestQueryDto {
  /** At least 2 characters give suggestions; shorter returns an empty list. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_QUERY_LENGTH)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
