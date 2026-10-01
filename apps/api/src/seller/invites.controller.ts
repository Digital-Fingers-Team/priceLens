import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { CurrentUser, Public } from '../common/decorators';
import { RequiresFlag } from '../feature-flags/requires-flag.decorator';
import { OPERATIONAL_FLAGS } from '../feature-flags/feature-flags.registry';
import { InvitesService } from './invites.service';
import { CreateInviteDto } from './dto/seller.dto';

/**
 * Workspace invitations. Not gated on a plan feature, for the same reason as
 * adding members: the seat count is the limit (assertSeatAvailable).
 */
@ApiTags('seller')
@Controller()
@RequiresFlag(OPERATIONAL_FLAGS.ORG_INVITES)
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Get('seller/workspaces/:orgId/invites')
  list(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.invites.list(orgId, user.id);
  }

  @Post('seller/workspaces/:orgId/invites')
  create(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string, @Body() dto: CreateInviteDto) {
    return this.invites.create(orgId, user.id, dto.email, dto.role);
  }

  @Delete('seller/workspaces/:orgId/invites/:inviteId')
  async revoke(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ) {
    await this.invites.revoke(orgId, user.id, inviteId);
    return { ok: true };
  }

  /** The invite page, before sign-in: which workspace, for which email. */
  @Public()
  @Get('invites/:token')
  preview(@Param('token') token: string) {
    return this.invites.preview(token);
  }

  @Post('invites/:token/accept')
  accept(@CurrentUser() user: User, @Param('token') token: string) {
    return this.invites.accept(token, user.id);
  }
}
