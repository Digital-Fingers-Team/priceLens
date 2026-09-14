import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationChannelType } from '@prisma/client';

/** IN_APP is excluded deliberately: it has no destination and cannot be configured. */
export class UpsertChannelDto {
  @IsEnum(NotificationChannelType)
  type!: NotificationChannelType;

  @IsString()
  @Length(1, 255)
  destination!: string;
}

export class VerifyChannelDto {
  @IsEnum(NotificationChannelType)
  type!: NotificationChannelType;

  /** Empty for Telegram, where the code is sent to the bot rather than typed here. */
  @IsOptional()
  @IsString()
  @Length(0, 64)
  code?: string;
}

export class SetChannelActiveDto {
  @IsEnum(NotificationChannelType)
  type!: NotificationChannelType;

  @IsBoolean()
  isActive!: boolean;
}

export class ListNotificationsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean;
}
