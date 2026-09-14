import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';

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
