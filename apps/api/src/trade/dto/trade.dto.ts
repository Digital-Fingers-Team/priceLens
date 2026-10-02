import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { TRACKED_CURRENCIES } from '../fx-rate.providers';

export class OpportunitiesQuery {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  minMarginPct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  offset?: number;
}

export class FxHistoryQuery {
  @IsOptional()
  @IsIn([...TRACKED_CURRENCIES])
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(730)
  days?: number;
}

export class TrendRadarQuery {
  /** Any day of the week to show (YYYY-MM-DD); the newest week when omitted. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  week?: string;
}

export class BuildTrendRadarDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  week?: string;
}
