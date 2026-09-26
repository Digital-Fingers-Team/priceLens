import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** GET /admin/review-queue */
export class ReviewQueueQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** PATCH /admin/review-queue/:id/resolve */
export class ResolveReviewItemDto {
  @IsIn(['ACCEPT', 'REJECT'])
  decision!: 'ACCEPT' | 'REJECT';

  /** The product to attach the listing to. Required to accept an item that proposed none. */
  @IsOptional()
  @IsUUID()
  canonicalProductId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

/** POST /admin/ingest/live */
export class RunLiveIngestionDto {
  /** Store slugs to sweep; all enabled stores when omitted. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(/^[a-z0-9-]{1,64}$/, { each: true })
  platformSlugs?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limitPerQuery?: number;
}

/** POST /admin/reconcile */
export class RunReconciliationDto {
  /** Only log proposed merges. Defaults to RECONCILIATION_DRY_RUN. */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  maxPairs?: number;
}

/** POST /admin/store-coverage-sweep */
export class RunStoreCoverageSweepDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxProducts?: number;
}
