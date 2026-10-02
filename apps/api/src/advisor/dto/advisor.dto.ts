import { IsString, Length } from 'class-validator';

export class AskAdvisorDto {
  @IsString()
  @Length(3, 500)
  message!: string;
}
