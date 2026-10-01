import { registerAs } from '@nestjs/config';

export default registerAs('notifications', () => ({
  // ─── Email (SMTP) ──────────────────────────────────────────────────────
  // Unset host disables the email channel cleanly: NotificationService marks
  // those deliveries SKIPPED rather than FAILED, so an unconfigured
  // deployment does not accumulate a backlog of phantom failures.
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpSecure: (process.env.SMTP_SECURE ?? 'false') === 'true',
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPassword: process.env.SMTP_PASSWORD ?? '',
  emailFrom: process.env.EMAIL_FROM ?? 'PriceLens <alerts@pricelens.work.gd>',

  // ─── Telegram ──────────────────────────────────────────────────────────
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  telegramApiBase: process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org',

  // How many notifications one user can be sent per hour across all channels.
  // Protects users from an alert storm (a scrape glitch that moves a thousand
  // prices at once) and protects our sending reputation.
  maxPerUserPerHour: Number(process.env.NOTIFICATIONS_MAX_PER_USER_PER_HOUR ?? 20),

  // Deliveries are retried by a scheduled sweep; give up after this many.
  maxDeliveryAttempts: Number(process.env.NOTIFICATIONS_MAX_ATTEMPTS ?? 4),

  // ─── Web push (VAPID) ─────────────────────────────────────────────────
  // Our own key pair (npx web-push generate-vapid-keys); no account needed.
  // The subject is a contact URL or mailto: the push services can reach.
  webPushPublicKey: process.env.WEB_PUSH_PUBLIC_KEY ?? '',
  webPushPrivateKey: process.env.WEB_PUSH_PRIVATE_KEY ?? '',
  webPushSubject: process.env.WEB_PUSH_SUBJECT ?? '',

  // When free plans' held alert emails go out as one digest (UTC).
  alertDigestCron: process.env.ALERT_DIGEST_CRON ?? '0 6 * * *',
}));
