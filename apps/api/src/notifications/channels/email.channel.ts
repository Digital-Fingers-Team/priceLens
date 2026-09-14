import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannelType } from '@prisma/client';
import nodemailer, { Transporter } from 'nodemailer';
import { DeliveryResult, NotificationChannelDriver, OutboundNotification } from './notification-channel.interface';

/** Minimal HTML escaping — notification bodies carry product titles from
 *  scraped listings, which are attacker-influenced text. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class EmailChannel implements NotificationChannelDriver {
  readonly type = NotificationChannelType.EMAIL;

  private readonly logger = new Logger(EmailChannel.name);
  private transporter: Transporter | null = null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('notifications.smtpHost', '');
    this.from = this.config.get<string>('notifications.emailFrom', 'PriceLens <alerts@pricelens.local>');

    if (!host) {
      this.logger.warn('SMTP_HOST is not set — email notifications are disabled');
      return;
    }

    const user = this.config.get<string>('notifications.smtpUser', '');
    const pass = this.config.get<string>('notifications.smtpPassword', '');

    this.transporter = nodemailer.createTransport({
      host,
      port: this.config.get<number>('notifications.smtpPort', 587),
      secure: this.config.get<boolean>('notifications.smtpSecure', false),
      ...(user ? { auth: { user, pass } } : {}),
      // Alert delivery is bursty; a pooled connection avoids a TLS handshake
      // per message when the alert sweep fans out to many users at once.
      pool: true,
      maxConnections: 3,
    });
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  async send(destination: string, notification: OutboundNotification): Promise<DeliveryResult> {
    if (!this.transporter) return { ok: false, skipped: true, error: 'SMTP not configured' };

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: destination,
        subject: notification.title,
        text: notification.url ? `${notification.body}\n\n${notification.url}` : notification.body,
        html: this.render(notification),
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  private render(notification: OutboundNotification): string {
    const title = escapeHtml(notification.title);
    const body = escapeHtml(notification.body).replace(/\n/g, '<br />');
    const cta = notification.url
      ? `<p style="margin:24px 0 0"><a href="${escapeHtml(notification.url)}" style="background:#0f172a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">View on PriceLens</a></p>`
      : '';

    return `<!doctype html>
<html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin:0 0 16px">PriceLens</p>
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
      <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#0f172a">${title}</h1>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#334155">${body}</p>
      ${cta}
    </div>
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">
      You are receiving this because you set up an alert on PriceLens.
      Manage your notifications in your account settings.
    </p>
  </div>
</body></html>`;
  }
}
