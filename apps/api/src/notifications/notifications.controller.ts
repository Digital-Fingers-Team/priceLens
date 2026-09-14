import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NotificationChannelType, User } from '@prisma/client';
import { CurrentUser } from '../common/decorators';
import { NotificationsService } from './notifications.service';
import { NotificationChannelsService } from './notification-channels.service';
import {
  ListNotificationsQuery,
  SetChannelActiveDto,
  UpsertChannelDto,
  VerifyChannelDto,
} from './dto/notifications.dto';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly channels: NotificationChannelsService,
  ) {}

  @Get()
  list(@CurrentUser() user: User, @Query() query: ListNotificationsQuery) {
    return this.notifications.list(user.id, {
      limit: query.limit,
      cursor: query.cursor,
      unreadOnly: query.unreadOnly,
    });
  }

  /** Polled by the navbar bell; deliberately tiny. */
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: User) {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @Post(':id/read')
  async markRead(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    await this.notifications.markRead(user.id, id);
    return { ok: true };
  }

  @Post('read-all')
  async markAllRead(@CurrentUser() user: User) {
    return { count: await this.notifications.markAllRead(user.id) };
  }

  // ─── Channels ───────────────────────────────────────────────────────────

  @Get('channels')
  listChannels(@CurrentUser() user: User) {
    return this.channels.list(user.id);
  }

  @Post('channels')
  upsertChannel(@CurrentUser() user: User, @Body() dto: UpsertChannelDto) {
    return this.channels.upsert(user.id, dto.type, dto.destination);
  }

  @Post('channels/verify')
  verifyChannel(@CurrentUser() user: User, @Body() dto: VerifyChannelDto) {
    return this.channels.verify(user.id, dto.type, dto.code ?? '');
  }

  @Post('channels/active')
  setChannelActive(@CurrentUser() user: User, @Body() dto: SetChannelActiveDto) {
    return this.channels.setActive(user.id, dto.type, dto.isActive);
  }

  @Delete('channels/:type')
  async removeChannel(@CurrentUser() user: User, @Param('type') type: NotificationChannelType) {
    await this.channels.remove(user.id, type);
    return { ok: true };
  }
}
