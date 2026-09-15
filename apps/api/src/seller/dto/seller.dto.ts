import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CompetitorEventType, OrgRole, OrgType } from '@prisma/client';

export class CreateOrganizationDto {
  @IsString()
  @Length(2, 128)
  name!: string;

  @IsEnum(OrgType)
  type!: OrgType;

  /** The tracked store that is this seller's own, when we crawl it. */
  @IsOptional()
  @IsUUID()
  platformId?: string;
}

export class AddMemberDto {
  @IsString()
  @Length(3, 255)
  email!: string;

  @IsEnum(OrgRole)
  role!: OrgRole;
}

export class UpsertSellerProductDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @Length(1, 128)
  sku!: string;

  @IsString()
  @Length(1, 255)
  name!: string;

  @IsOptional()
  @IsUUID()
  canonicalProductId?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentPrice?: number | null;

  /** Percentages of price, not of cost. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(95)
  targetMarginPct?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(95)
  minMarginPct?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  mapPrice?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertAlertRuleDto {
  @IsEnum(CompetitorEventType)
  type!: CompetitorEventType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  thresholdPct?: number;

  @IsOptional()
  @IsUUID()
  sellerProductId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  cooldownHours?: number;
}

export class ListEventsQuery {
  @IsOptional()
  @IsEnum(CompetitorEventType)
  type?: CompetitorEventType;

  @IsOptional()
  @IsUUID()
  sellerProductId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unacknowledgedOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsUUID()
  cursor?: string;
}
