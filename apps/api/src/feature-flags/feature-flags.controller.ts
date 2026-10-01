import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { FeatureFlagsService } from './feature-flags.service';
import { FlagKey, isFlagKey } from './feature-flags.registry';
import { SetFeatureFlagDto } from './dto/feature-flags.dto';
import { FeatureDisabledException } from './feature-flags.errors';

@ApiTags('feature-flags')
@Controller()
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  /**
   * Effective flags for the web app. Public: a switched-off feature is hidden
   * for signed-out visitors too. Says nothing a visitor could not learn by
   * clicking around.
   */
  @Public()
  @Get('flags')
  snapshot() {
    return this.flags.snapshot();
  }

  @Roles(UserRole.ADMIN)
  @Get('admin/flags')
  list() {
    return this.flags.list();
  }

  @Roles(UserRole.ADMIN)
  @Put('admin/flags/:key')
  set(@CurrentUser() actor: User, @Param('key') key: string, @Body() dto: SetFeatureFlagDto) {
    return this.flags.set(this.known(key), dto.enabled, actor.id);
  }

  @Roles(UserRole.ADMIN)
  @Delete('admin/flags/:key')
  reset(@CurrentUser() actor: User, @Param('key') key: string) {
    return this.flags.reset(this.known(key), actor.id);
  }

  private known(key: string): FlagKey {
    if (!isFlagKey(key)) throw new FeatureDisabledException(key);
    return key;
  }
}
