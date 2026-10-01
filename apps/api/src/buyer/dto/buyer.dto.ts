import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PromoType, PromoValueType, WarrantyType } from '@prisma/client';

export class SaveInstallmentPlanDto {
  @IsOptional() @IsString() @MaxLength(64) provider?: string;
  @IsOptional() @IsIn(['BNPL', 'BANK_CARD']) kind?: string;
  @IsOptional() @IsInt() @Min(1) @Max(120) months?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(300) markupPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) adminFeePct?: number;
  @IsOptional() @IsNumber() @Min(0) adminFeeFlat?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) downPaymentPct?: number;
  @IsOptional() @IsNumber() @Min(0) minAmount?: number | null;
  @IsOptional() @IsNumber() @Min(0) maxAmount?: number | null;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) platformIds?: string[];
  @IsOptional() @IsDateString() validUntil?: string | null;
  @IsOptional() @IsUrl() @MaxLength(512) sourceUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(255) notes?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SavePromoDto {
  @IsOptional() @IsEnum(PromoType) type?: PromoType;
  @IsOptional() @IsUUID() platformId?: string | null;
  @IsOptional() @IsString() @MaxLength(64) bankName?: string | null;
  @IsOptional() @IsString() @MaxLength(64) code?: string | null;
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(160) titleAr?: string | null;
  @IsOptional() @IsEnum(PromoValueType) valueType?: PromoValueType;
  @IsOptional() @IsNumber() @Min(0) value?: number;
  @IsOptional() @IsNumber() @Min(0) maxDiscount?: number | null;
  @IsOptional() @IsNumber() @Min(0) minSpend?: number | null;
  @IsOptional() @IsDateString() validFrom?: string | null;
  @IsOptional() @IsDateString() validUntil?: string | null;
  @IsOptional() @IsBoolean() verified?: boolean;
  @IsOptional() @IsUrl() @MaxLength(512) sourceUrl?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SaveWarrantyRuleDto {
  @IsUUID() platformId!: string;
  @IsOptional() @IsString() @MaxLength(64) brand?: string | null;
  @IsEnum(WarrantyType) type!: WarrantyType;
  @IsOptional() @IsInt() @Min(0) @Max(120) months?: number;
  @IsOptional() @IsString() @MaxLength(128) agentName?: string | null;
  @IsOptional() @IsString() @MaxLength(255) notes?: string | null;
}

export class SetBanksDto {
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(64, { each: true }) banks!: string[];
}

export class ReportCouponDto {
  @IsBoolean() worked!: boolean;
}

export class CartItemDto {
  @IsUUID() productId!: string;
  @IsOptional() @IsInt() @Min(1) @Max(99) qty?: number;
}

export class CreateCartWatchDto {
  @IsString() @MaxLength(80) name!: string;
  @IsNumber() @Min(1) targetTotal!: number;
  @IsOptional() @IsBoolean() acrossStores?: boolean;
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => CartItemDto) items!: CartItemDto[];
}

export class UpdateCartWatchDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsNumber() @Min(1) targetTotal?: number;
  @IsOptional() @IsBoolean() acrossStores?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => CartItemDto) items?: CartItemDto[];
}
