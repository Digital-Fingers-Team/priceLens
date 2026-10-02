import { Body, Controller, ForbiddenException, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { Public, Roles } from '../common/decorators';
import { RequiresFlag } from '../feature-flags/requires-flag.decorator';
import { OPERATIONAL_FLAGS } from '../feature-flags/feature-flags.registry';
import { TelegramBotService, TelegramUpdate } from './telegram-bot.service';

@ApiTags('telegram')
@Controller()
@RequiresFlag(OPERATIONAL_FLAGS.TELEGRAM_BOT)
export class TelegramBotController {
  constructor(private readonly bot: TelegramBotService) {}

  /**
   * Telegram's webhook. Public: authenticated by the secret token Telegram
   * echoes in a header. Always 200 for a genuine call, so Telegram does not
   * retry (and answer twice).
   */
  @Public()
  @SkipThrottle()
  @ApiExcludeEndpoint()
  @HttpCode(200)
  @Post('telegram/webhook')
  async webhook(@Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() update: TelegramUpdate) {
    if (!this.bot.checkSecret(secret)) throw new ForbiddenException();
    await this.bot.handle(update);
    return { ok: true };
  }

  @Roles(UserRole.ADMIN)
  @Post('admin/telegram/webhook')
  register() {
    return this.bot.registerWebhook();
  }
}
