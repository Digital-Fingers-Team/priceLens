import { ManualPaymentMethod, ManualPaymentStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, MaxLength, Min } from 'class-validator';

export class CreateCheckoutDto {
  @IsString()
  @Length(1, 64)
  planKey!: string;
}

export class CancelSubscriptionDto {
  /** Default is cancel-at-period-end; the user keeps what they paid for. */
  @IsOptional()
  @IsBoolean()
  immediately?: boolean;
}

export class AdminGrantPlanDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @Length(1, 64)
  planKey!: string;

  /** Overrides the plan's interval for hand-sold contracts. */
  @IsOptional()
  @IsInt()
  @Min(1)
  days?: number;
}

export class StartManualPaymentDto {
  @IsString()
  @Length(1, 64)
  planKey!: string;
}

export class SubmitManualPaymentDto {
  @IsEnum(ManualPaymentMethod)
  method!: ManualPaymentMethod;

  /** The transfer reference printed on the wallet / InstaPay receipt. */
  @IsString()
  @Length(4, 64)
  reference!: string;

  /** The number or InstaPay address the money was sent from. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  payerAccount?: string;
}

export class RejectManualPaymentDto {
  /** Shown to the customer. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class ListManualPaymentsQueryDto {
  @IsOptional()
  @IsEnum(ManualPaymentStatus)
  status?: ManualPaymentStatus;
}

export class StartInvoiceCheckoutDto {
  @IsString()
  @Length(1, 64)
  planKey!: string;

  @IsString()
  @IsIn(['paymob', 'mock'])
  provider!: string;
}

export class TestPayDto {
  @IsIn(['PAID', 'FAILED'])
  outcome!: 'PAID' | 'FAILED';
}

/** Admin plan editor. Every field optional; only what is sent changes. */
export class AdminUpdatePlanDto {
  @IsOptional()
  @IsString()
  @Length(1, 128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Piastres. 12900 = 129.00 EGP. */
  @IsOptional()
  @IsInt()
  @Min(0)
  priceMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  intervalDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  /** A PlanLimits object; validated by parsePlanLimits. */
  @IsOptional()
  @IsObject()
  limits?: Record<string, unknown>;
}
