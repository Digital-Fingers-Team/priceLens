# Deploy notes — v2 expansion

What the owner needs to know to run the v2 features: credentials to create, what is switched off until they exist, and how each phase was deployed. Updated per phase.

## Credentials the owner must create

| For | Variables (in `.env`) | Until set |
|---|---|---|
| Paymob (cards, wallets, Fawry) | `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_HMAC_SECRET`, `PAYMOB_INTEGRATION_IDS` | Not offered at checkout. Wallet/InstaPay keeps working. Paymob needs a registered business; the owner said on 2026-09-29 the business is not registered yet. |
| Paymob callback | In the Paymob dashboard, set the transaction-processed callback to `https://pricelens.work.gd/api/v1/billing/webhook/paymob` | Payments would not activate plans |
| Email (invites, alerts) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Invitations show a link to copy by hand; email alerts are recorded as SKIPPED |
| Telegram alerts | `TELEGRAM_BOT_TOKEN` | Telegram channel inert (SKIPPED) |
| Stripe (optional) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, plus a Stripe Price id on each plan | Stripe checkout hidden |

After editing `.env`: `./scripts/deploy-api.sh --no-build` restarts the API and worker with the new values.

## Feature flags

`/admin/flags` lists every switch. A row set there wins; otherwise `FEATURE_<KEY>` in `.env`; otherwise the default. Features that existed before v2 default **on**. Each v2 feature defaults **off** until the commit that finishes it turns its default on. `mock_checkout` (instant fake payments) defaults off. In production only an admin can use it, even when it is on: that is how the post-deploy checkout smoke test runs.

## Phase 1 — Foundation

Migration `20261001000000_v2_foundation`:
- new tables `invoices`, `feature_flags`, `organization_invites`, `price_daily`; column `subscriptions.renewal_reminder_sent_at`
- data: adds the v2 feature keys to the existing Plus / Seller / Enterprise plan rows (additive, idempotent), and moves Enterprise to sort order 4 so the new Seller Plus plan (seeded on boot, 2,499 EGP placeholder) sits between them. Checked against production inside a rolled-back transaction before deploying: Plus 7→16 features, Seller 12→25, Enterprise 18→36.

New job: `run-price-rollup` (`PRICE_ROLLUP_CRON`, default every 6 h). The first run backfills all history; on production data the backfill query takes under 1 s.
