import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/** POST /analytics/views: the web tracker, when a page opens. */
export class RecordPageViewDto {
  /** Made by the browser, so the duration beacon can name the view later. */
  @IsUUID()
  id!: string;

  @IsUUID()
  visitorId!: string;

  @IsUUID()
  sessionId!: string;

  /** Pathname and query string, e.g. "/en/search?q=iphone". */
  @IsString()
  @MaxLength(2048)
  path!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  referrer?: string;
}

/** POST /analytics/views/:id/duration: when the page is left or hidden. */
export class RecordDurationDto {
  /** Time the page was visible, in ms. Sent more than once; the largest wins. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24 * 60 * 60 * 1000)
  durationMs!: number;

  /** The result count a search page showed. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  searchTotal?: number;
}

/** GET /analytics/summary */
export class AnalyticsSummaryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 7, 30, 90])
  days?: 1 | 7 | 30 | 90;
}
