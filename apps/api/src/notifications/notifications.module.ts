import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EmailChannel } from './channels/email.channel';
import { InAppChannel } from './channels/in-app.channel';
import { TelegramChannel } from './channels/telegram.channel';
import { NotificationChannelsService } from './notification-channels.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * @Global: the alert engine, the workers and (later) the seller and brand
 * modules all need to notify. Exporting globally keeps a new feature from
 * silently shipping without a way to tell the user anything.
 */
@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [NotificationsController],
  providers: [InAppChannel, EmailChannel, TelegramChannel, NotificationsService, NotificationChannelsService],
  exports: [NotificationsService, NotificationChannelsService, EmailChannel, TelegramChannel],
})
export class NotificationsModule {}
