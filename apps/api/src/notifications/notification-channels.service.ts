import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationChannelType } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { UpgradeRequiredException } from '../billing/billing.errors';
import { EmailChannel } from './channels/email.channel';
import { TelegramChannel } from './channels/telegram.channel';

const VERIFY_TTL_MINUTES = 30;

@Injectable()
export class NotificationChannelsService {
  private readonly logger = new Logger(NotificationChannelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly email: EmailChannel,
    private readonly telegram: TelegramChannel,
  ) {}

  async list(userId: string) {
    const [channels, { limits }] = await Promise.all([
      this.prisma.notificationChannel.findMany({ where: { userId }, orderBy: { type: 'asc' } }),
      this.entitlements.getEntitlements(userId),
    ]);

    const allowed = new Set(limits.notificationChannels);

    return {
      channels: channels.map((channel) => ({
        id: channel.id,
        type: channel.type,
        // Never echo a full destination back: it is a contact detail, and the
        // masked form is enough for the user to recognise it.
        destination: this.mask(channel.type, channel.destination),
        isActive: channel.isActive,
        verified: channel.verified,
        allowedByPlan: allowed.has(channel.type),
        failureCount: channel.failureCount,
        lastUsedAt: channel.lastUsedAt?.toISOString() ?? null,
      })),
      available: {
        [NotificationChannelType.IN_APP]: { configured: true, allowed: true },
        [NotificationChannelType.EMAIL]: {
          configured: this.email.isConfigured(),
          allowed: allowed.has(NotificationChannelType.EMAIL),
        },
        [NotificationChannelType.TELEGRAM]: {
          configured: this.telegram.isConfigured(),
          allowed: allowed.has(NotificationChannelType.TELEGRAM),
        },
      },
    };
  }

  /**
   * Create or update a channel and start verification.
   *
   * A destination is never trusted on the user's word: an unverified channel
   * is never delivered to, which stops PriceLens being used to mail arbitrary
   * third parties.
   */
  async upsert(userId: string, type: NotificationChannelType, destination: string) {
    if (type === NotificationChannelType.IN_APP) {
      throw new BadRequestException('The in-app inbox is always on and has no destination');
    }

    const { limits } = await this.entitlements.getEntitlements(userId);
    if (!limits.notificationChannels.includes(type)) {
      throw new UpgradeRequiredException(`${type} notifications are not included in your plan.`);
    }

    const cleaned = destination.trim();
    this.validateDestination(type, cleaned);

    const token = randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + VERIFY_TTL_MINUTES * 60_000);

    const channel = await this.prisma.notificationChannel.upsert({
      where: { userId_type: { userId, type } },
      create: {
        userId,
        type,
        destination: cleaned,
        verified: false,
        verifyToken: token,
        verifyExpiresAt: expiresAt,
        failureCount: 0,
      },
      update: {
        destination: cleaned,
        // Changing the destination invalidates any prior verification.
        verified: false,
        verifiedAt: null,
        verifyToken: token,
        verifyExpiresAt: expiresAt,
        isActive: true,
        failureCount: 0,
      },
    });

    const instructions = await this.startVerification(type, cleaned, token);

    return {
      id: channel.id,
      type: channel.type,
      destination: this.mask(type, cleaned),
      verified: false,
      instructions,
    };
  }

  /**
   * Complete verification.
   *
   * For EMAIL the user pastes the code we mailed them. For TELEGRAM the user
   * sends the code to the bot and we look it up in the bot's update feed —
   * bots cannot message a user who has not spoken to them first.
   */
  async verify(userId: string, type: NotificationChannelType, code: string) {
    const channel = await this.prisma.notificationChannel.findUnique({
      where: { userId_type: { userId, type } },
    });

    if (!channel) throw new NotFoundException('No such notification channel');
    if (channel.verified) return { verified: true };

    if (!channel.verifyToken || !channel.verifyExpiresAt || channel.verifyExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Your verification code has expired. Request a new one.');
    }

    if (type === NotificationChannelType.TELEGRAM) {
      const chatId = await this.telegram.findChatIdByVerificationCode(channel.verifyToken);
      if (!chatId) {
        throw new BadRequestException(
          'We have not seen your code yet. Send it to the PriceLens bot on Telegram, then try again.',
        );
      }
      // The chat id, not the handle, is what Telegram actually delivers to.
      await this.prisma.notificationChannel.update({
        where: { id: channel.id },
        data: {
          destination: chatId,
          verified: true,
          verifiedAt: new Date(),
          verifyToken: null,
          verifyExpiresAt: null,
        },
      });
      return { verified: true };
    }

    if (code.trim().toUpperCase() !== channel.verifyToken.toUpperCase()) {
      throw new BadRequestException('That code is not correct.');
    }

    await this.prisma.notificationChannel.update({
      where: { id: channel.id },
      data: { verified: true, verifiedAt: new Date(), verifyToken: null, verifyExpiresAt: null },
    });
    return { verified: true };
  }

  async setActive(userId: string, type: NotificationChannelType, isActive: boolean) {
    const result = await this.prisma.notificationChannel.updateMany({
      where: { userId, type },
      data: { isActive },
    });
    if (result.count === 0) throw new NotFoundException('No such notification channel');
    return { type, isActive };
  }

  async remove(userId: string, type: NotificationChannelType) {
    await this.prisma.notificationChannel.deleteMany({ where: { userId, type } });
  }

  /**
   * Every new user gets an email channel pointed at their account address,
   * pre-verified, because they already proved control of it at registration.
   * Without this a user would set an alert and hear nothing until they went
   * looking for a settings page.
   */
  async ensureDefaultChannels(userId: string, email: string): Promise<void> {
    try {
      await this.prisma.notificationChannel.upsert({
        where: { userId_type: { userId, type: NotificationChannelType.EMAIL } },
        create: {
          userId,
          type: NotificationChannelType.EMAIL,
          destination: email,
          verified: true,
          verifiedAt: new Date(),
        },
        update: {},
      });
    } catch (error) {
      this.logger.warn(`Could not create default email channel for ${userId}: ${(error as Error).message}`);
    }
  }

  private async startVerification(
    type: NotificationChannelType,
    destination: string,
    token: string,
  ): Promise<string> {
    if (type === NotificationChannelType.EMAIL) {
      if (!this.email.isConfigured()) {
        return 'Email sending is not configured on this deployment yet. Contact support to enable it.';
      }
      const result = await this.email.send(destination, {
        title: 'Confirm your PriceLens alert email',
        body: `Your verification code is ${token}. It expires in ${VERIFY_TTL_MINUTES} minutes.`,
      });
      if (!result.ok) {
        throw new BadRequestException(`We could not send to that address: ${result.error}`);
      }
      return `We sent a code to ${this.mask(type, destination)}. Enter it to finish.`;
    }

    if (!this.telegram.isConfigured()) {
      return 'Telegram is not configured on this deployment yet.';
    }
    return `Send this code to the PriceLens bot on Telegram: ${token}`;
  }

  private validateDestination(type: NotificationChannelType, destination: string): void {
    if (!destination) throw new BadRequestException('A destination is required');

    if (type === NotificationChannelType.EMAIL) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(destination) || destination.length > 255) {
        throw new BadRequestException('That does not look like a valid email address');
      }
      return;
    }

    if (type === NotificationChannelType.TELEGRAM) {
      // Accept either an @handle (what a user knows) or a numeric chat id
      // (what we end up storing after verification).
      if (!/^@?[A-Za-z0-9_]{4,64}$/.test(destination) && !/^-?\d{5,20}$/.test(destination)) {
        throw new BadRequestException('Enter your Telegram username, e.g. @yourname');
      }
    }
  }

  private mask(type: NotificationChannelType, destination: string | null): string | null {
    if (!destination) return null;

    if (type === NotificationChannelType.EMAIL) {
      const [local, domain] = destination.split('@');
      if (!domain) return '***';
      const head = local.slice(0, 2);
      return `${head}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
    }

    if (destination.length <= 4) return '***';
    return `${'*'.repeat(destination.length - 4)}${destination.slice(-4)}`;
  }
}
