import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators';
import { FEATURES } from '../billing/plan-limits';
import { RequiresFeature } from '../billing/requires-feature.decorator';
import { AdvisorService } from './advisor.service';
import { AskAdvisorDto } from './dto/advisor.dto';

@ApiTags('advisor')
@Controller('advisor')
export class AdvisorController {
  constructor(private readonly advisor: AdvisorService) {}

  @RequiresFeature(FEATURES.ADVISOR)
  @Post()
  ask(@CurrentUser() user: User, @Body() dto: AskAdvisorDto) {
    return this.advisor.advise(user.id, dto.message);
  }
}
