import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetFeatureFlagDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}
