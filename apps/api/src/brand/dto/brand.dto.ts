import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ReportPeriod } from '@prisma/client';

export class UpsertBrandWatchDto {
  @IsString()
  @Length(1, 128)
  brand!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsBoolean()
  isOwnBrand?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class DistributionQuery {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  retailerSlug?: string;

  @IsOptional()
  @IsUUID()
  sellerProductId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  inStock?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  belowMapOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}

export class GenerateReportDto {
  @IsOptional()
  @IsEnum(ReportPeriod)
  period?: ReportPeriod;
}
