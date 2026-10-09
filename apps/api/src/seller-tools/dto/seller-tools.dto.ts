import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, IsUrl, Length, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { RepricerStrategy } from '@prisma/client';

export class ProfitQuery {
  /** Price to test; the seller's own price when omitted. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(10_000_000)
  price?: number;
}

export class TimelineQuery {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(7)
  @Max(365)
  days?: number;
}

export class RepricerSettingsDto {
  /** null turns the repricer off for this product. */
  @ValidateIf((_, value) => value !== null)
  @IsEnum(RepricerStrategy)
  strategy!: RepricerStrategy | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100_000)
  offset?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0.01)
  floor?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0.01)
  ceiling?: number | null;
}

export class ImportCsvDto {
  /** The file's text: a header row with sku and name, then one product per line. */
  @IsString()
  @Length(1, 1_000_000)
  csv!: string;
}

export class ImportUrlDto {
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(1000)
  url!: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  sku?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;
}

export class AddRankKeywordDto {
  @IsUUID()
  platformId!: string;

  @IsString()
  @Length(2, 160)
  keyword!: string;
}

export class UpsertFeeTableDto {
  @IsUUID()
  platformId!: string;

  /** A category slug, or empty for the platform default. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryKey?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPct!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  returnRatePct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  vatPct?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0.01)
  tierUpTo?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPctAbove?: number | null;

  @IsOptional()
  @IsBoolean()
  tierWholePrice?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minCommission?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
