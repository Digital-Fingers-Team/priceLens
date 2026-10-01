import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class SaveLandedCostRuleDto {
  @ApiProperty()
  @IsUUID()
  platformId!: string;

  /** Omit (or null) for the store's default rule. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000) shippingFlat?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) shippingPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(300) customsPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) vatPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000) handlingFee?: number;

  @IsOptional() @IsString() @MaxLength(32) deliveryDays?: string | null;
  @IsOptional() @IsString() @MaxLength(255) notes?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
