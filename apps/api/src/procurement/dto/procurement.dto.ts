import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class QuoteItemDto {
  @IsString()
  @Length(2, 255)
  query!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  specs?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxUnitPrice?: number;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;
}

export class CreateQuoteDto {
  @IsString()
  @Length(2, 160)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items!: QuoteItemDto[];
}

/** Pin a line to a specific catalogue product, or change its quantity, note or budget. */
export class UpdateQuoteItemDto {
  @IsOptional()
  @IsUUID()
  canonicalProductId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  quantity?: number;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxUnitPrice?: number;
}
