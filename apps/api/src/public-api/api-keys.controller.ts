import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators';
import { FEATURES } from '../billing/plan-limits';
import { RequiresFeature } from '../billing/requires-feature.decorator';
import { ApiKeysService } from './api-keys.service';
import { IssueApiKeyDto } from './dto/public-api.dto';

/** Key management, authenticated with a normal session rather than a key. */
@ApiTags('api-keys')
@Controller('workspaces/:orgId/api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @RequiresFeature(FEATURES.API_ACCESS)
  list(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.apiKeys.list(user.id, orgId);
  }

  /** The plaintext key is in this response and nowhere else, ever again. */
  @Post()
  @RequiresFeature(FEATURES.API_ACCESS)
  issue(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: IssueApiKeyDto,
  ) {
    return this.apiKeys.issue(user.id, orgId, dto);
  }

  @Delete(':keyId')
  revoke(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('keyId', ParseUUIDPipe) keyId: string,
  ) {
    return this.apiKeys.revoke(user.id, orgId, keyId);
  }

  @Get('usage')
  @RequiresFeature(FEATURES.API_ACCESS)
  usage(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('days') days?: string,
  ) {
    return this.apiKeys.usage(user.id, orgId, days ? Number(days) : undefined);
  }
}
