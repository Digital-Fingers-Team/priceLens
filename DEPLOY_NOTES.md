# Deploy notes — v2 expansion

What the owner needs to know to run the v2 features: credentials to create, what is switched off until they exist, and how each phase was deployed. Updated per phase.

## Credentials the owner must create

| For | Variables (in `.env`) | Until set |
|---|---|---|
| Paymob (cards, wallets, Fawry) | `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_HMAC_SECRET`, `PAYMOB_INTEGRATION_IDS` | Not offered at checkout. Wallet/InstaPay keeps working. Paymob needs a registered business; the owner said on 2026-09-29 the business is not registered yet. |
| Paymob callback | In the Paymob dashboard, set the transaction-processed callback to `https://pricelens.work.gd/api/v1/billing/webhook/paymob` | Payments would not activate plans |
| Email (invites, alerts) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Invitations show a link to copy by hand; email alerts are recorded as SKIPPED |
| Telegram alerts and bot | `TELEGRAM_BOT_TOKEN` (from @BotFather), `TELEGRAM_WEBHOOK_SECRET` (any long random string) | Telegram channel inert (SKIPPED); the bot refuses every webhook call. After setting both, redeploy, then as admin `POST /api/v1/admin/telegram/webhook` once |
| Image search, advisor (optional second model) | `ANTHROPIC_API_KEY` | Gemini (the existing `GEMINI_API_KEY(S)`) does the work alone. With no model at all, image search answers 503 and the advisor falls back to Deal Hunter's top picks |
| Browser push | `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` | **Done on this server** (generated 2026-10-01, our own keys: no account). Regenerating them signs every browser out of push |
| Stripe (optional) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, plus a Stripe Price id on each plan | Stripe checkout hidden |

After editing `.env`: `./scripts/deploy-api.sh --no-build` restarts the API and worker with the new values.

## Feature flags

`/admin/flags` lists every switch. A row set there wins; otherwise `FEATURE_<KEY>` in `.env`; otherwise the default. Features that existed before v2 default **on**. Each v2 feature defaults **off** until the commit that finishes it turns its default on. `mock_checkout` (instant fake payments) defaults off. In production only an admin can use it, even when it is on: that is how the post-deploy checkout smoke test runs.

## Phase 1 — Foundation

Migration `20261001000000_v2_foundation`:
- new tables `invoices`, `feature_flags`, `organization_invites`, `price_daily`; column `subscriptions.renewal_reminder_sent_at`
- data: adds the v2 feature keys to the existing Plus / Seller / Enterprise plan rows (additive, idempotent), and moves Enterprise to sort order 4 so the new Seller Plus plan (seeded on boot, 2,499 EGP placeholder) sits between them. Checked against production inside a rolled-back transaction before deploying: Plus 7→16 features, Seller 12→25, Enterprise 18→36.

New job: `run-price-rollup` (`PRICE_ROLLUP_CRON`, default every 6 h). The first run backfills all history; on production data the backfill query takes under 1 s.

## Phase 2 — Buyer Pro essentials

Migration `20261001100000_v2_buyer_pro`:
- `NotificationChannelType` gains `WEB_PUSH`; `notification_channels.push_subscription`
- new table `landed_cost_rules`
- data: Plus / Seller / Enterprise plans gain the `WEB_PUSH` channel; one **placeholder** rule (15% customs, 14% VAT) for AliExpress, Alibaba, eBay and Walmart. **Review these rates in /admin/landed-cost**; buyers see them as an estimate with the rates written out. Dry-run against production in a rolled-back transaction before deploying.

Behaviour change to know about: with `realtime_alerts` on (default), alert **emails** for Free users are held and sent once a day (`ALERT_DIGEST_CRON`, 06:00 UTC); their in-app inbox is still immediate. Turn the flag off in /admin/flags to go back to instant email for everyone. Until SMTP is configured, emails are skipped either way.

New job: `run-alert-digest`.

## Phase 3 — Buyer differentiators

Migration `20261001200000_v2_buyer_differentiators`: tables `installment_plans`, `promos`, `promo_reports`, `user_banks`, `warranty_rules`, `cart_watches`, `cart_watch_items`, `product_reviews`, `review_summaries`. **No data**: the owner enters installment terms, bank / cashback offers, coupons and warranty rules in **/admin/buyer-offers** from the providers' published terms. Until then those sections simply don't show.

New job: `run-cart-watch` (`CART_WATCH_CRON`, hourly at :40).

## Phase 4 — Coverage

Migration `20261001300000_v2_coverage`: enum `StoreKind`, `platforms.kind` (B.TECH, 2B, Elaraby, Dream 2000 → OFFLINE_CHAIN), new platforms **Tradeline** and **Compumarts**, table `used_price_snapshots` (aggregates only).

New job: `run-used-market` (`USED_MARKET_CRON`, 01:15 UTC; `USED_MARKET_BATCH`, 120 products, one OpenSooq request every 3 s). Flag `used_market` turns it and the product-page range off.

## Phase 5 — New input channels

No migration. New routes: `POST /search/image` (Pro, multipart field `image`), `POST /advisor` (Pro), `POST /telegram/webhook` (Telegram only, secret header), `POST /admin/telegram/webhook` (admin, registers the webhook). Images are never written to disk or the database. Flag `telegram_bot` turns the bot off; `image_search` and `advisor` are plan features with their own flags.

## Phase 6 — Seller tools

Migration `20261001400000_v2_seller_tools` (additive): enums `RepricerStrategy`, `PriceChangeSource`; `seller_products` gains `listing_url`, floor/ceiling, repricer settings and the current suggestion; new tables `platform_fee_tables`, `price_change_logs`, `rank_keywords`, `rank_snapshots`. No data.

**To do: enter platform fees in /admin/fee-tables** (Noon, Jumia, Amazon.eg …) from each store's seller fee schedule. Until then the profit calculator and best-platform finder say there are no fee tables.

New jobs: `run-seller-repricer` (`SELLER_REPRICER_CRON`, hourly at :50; also connects links saved before we had crawled them) and `run-rank-tracking` (`RANK_TRACKING_CRON`, 02:30 UTC; one store search per distinct keyword, 2 s apart). The repricer only suggests; auto mode is unavailable (no official seller API connected).

## Phase 7 — Importers & traders

Migration `20261002100000_v2_importers` (additive): enums `FxSource`, `TrendScope`; new tables `fx_rates`, `import_opportunities`, `trend_signals`. No data.

New jobs: `run-fx-refresh` (`FX_REFRESH_CRON`, 07:20 and 13:20 UTC), `run-import-finder` (`IMPORT_FINDER_CRON`, 04:10 UTC) and `run-trend-radar` (`TREND_RADAR_CRON`, Saturday 04:40 UTC). Each is skipped when its plan feature flag (`fx_tracking`, `import_finder`, `trend_radar`) is off. No keys needed: the CBE page (`CBE_RATES_URL`) is public; it rejects requests without a browser user agent, so a layout change or block shows up as a failed CBE refresh in the worker log while the market rate keeps being stored.

Rate history starts on deploy day: "a month ago" stays empty for 30 days. Import opportunities only exist for stores with a landed-cost rule (/admin/landed-cost-rules). Run once after deploy: `POST /admin/trade/fx/refresh`, `/admin/trade/import-opportunities/rebuild`, `/admin/trade/trend-radar/build`.

## Phase 8 — Business

Migration `20261003100000_v2_business` (additive): enum `QuoteStatus`; tables `authorized_retailers`, `procurement_quotes`, `procurement_quote_items`. No data. New dependency `pdfkit`; the PDF font (`apps/api/assets/fonts/DejaVuSans.ttf`) ships in the image with the rest of `apps/api`. Arabic text in PDFs is shaped by the font but laid out simply (whole Arabic cells are reversed word by word); check an Arabic quote once by eye.

New feature key `procurement_quotes` (Enterprise, flag on by default). New routes: `/brand/workspaces/{org}/map/violations.csv`, `/authorized-retailers`, `/unauthorized-sellers`, `/reports/{id}/csv|pdf`, `/procurement/workspaces/{org}/quotes/...`, `/partner/search`. New web pages: `/business`, `/business/{org}`, `/developers`. No new jobs and no new environment variables. Enterprise is not self-serve: give a user the plan from /admin to try it.

