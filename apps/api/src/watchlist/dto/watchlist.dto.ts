import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { AlertType } from '@prisma/client';

export class AddWatchlistDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}

export class CreateAlertDto {
  @IsEnum(AlertType)
  alertType!: AlertType;

  /**
   * A target price, an absolute drop, or a percentage, depending on
   * `alertType`. Ignored for RESTOCK, which fires on a stock transition.
   */
  @IsNumber()
  @Min(0)
  thresholdValue!: number;

  /** Re-arm after firing instead of parking in TRIGGERED. */
  @IsOptional()
  @IsBoolean()
  repeatable?: boolean;

  /** Minimum hours between notifications for a repeating alert. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  cooldownHours?: number;
}
