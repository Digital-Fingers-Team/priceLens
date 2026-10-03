# Next session: what is left (written 2026-10-03)

PriceLens v2 is built, deployed and tagged `v2.0.0` (all 9 phases of `docs/PRICELENS_FEATURE_PLAN.md`). This file lists only what is still open. Per-phase detail is in `PROGRESS.md` and `DEPLOY_NOTES.md`.

## 1. Only the owner can do these

- **Telegram:** create the bot with @BotFather and set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` in `.env`, run `./scripts/deploy-api.sh --no-build`, then `POST /api/v1/admin/telegram/webhook` once as admin. The webhook must be re-registered even if it was set before, because it now also receives button presses (`callback_query`). The redesigned messages (HTML cards, "searching" message edited into the answer, "refresh prices" button, one automatic live price update, alert cards with a photo and an open button) have only been unit-tested: send a real test message once the token exists.
- **Email:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`. Until then email alerts are recorded as SKIPPED and invitations show a link to copy.
- **Paymob** (cards, wallets, Fawry): needs the registered business. Variables and callback URL are in `DEPLOY_NOTES.md`.
- **Optional:** `ANTHROPIC_API_KEY` (second model for image search and the advisor), Stripe keys.
- **Security housekeeping:** change the admin password (it was pasted into a chat on 2026-10-03). The admin account holds an Enterprise plan granted for 3 days (ends about 2026-10-06; revoke earlier in `/admin` if wanted). A workspace named "PriceLens Smoke Test" (empty) belongs to it.
- **Old secrets on disk:** `~/pricelens/.env.bak*` and `backups/env-before-*` hold earlier credentials. Delete them once you no longer need to roll back.

## 2. Data that needs a source

Seeded so far (all idempotent SQL in `scripts/sql/`, already applied to production): seller fees for Jumia, Amazon.eg and Noon (electronics and appliances only); installment plans for NBE and ALEXBANK at Noon, QNB at Elaraby, CIB at Noon, Banque Misr at Amazon.eg.

Still empty or thin:
- **Fees:** no fee row for categories outside electronics and appliances, so the profit calculator says "no fee table" for them. Tiered rates the table cannot hold (Amazon and Noon accessories and headphones: 15% to 1,000 EGP, 8% above) and Jumia's size-based processing fees are not included. Noon logistics (pickup per shipment) is not included.
- **Installments:** valU, Sympl and Souhoola (terms are per merchant and per campaign), B.TECH Mylo/MiniCash, HSBC at Jumia (monthly 2.7%, unclear whether flat or reducing balance). CIB's own page could not be read: its Noon terms came from two search lookups, so confirm them. Banque Misr at Amazon.eg has no stated end date.
- **Bank-card offers, cashback and coupons** (`/admin/buyer-offers`): nothing seeded on purpose. Coupons are ranked by verification and buyer reports, so only seed codes someone has tried.
- **Warranty rules** (`/admin/buyer-offers`): nothing verifiable was found at store level.
- **Customs / landed cost** (`/admin/landed-cost`): placeholder 15% customs and 14% VAT for AliExpress, Alibaba, eBay and Walmart. Public sources say electronics duty is 5-30% by tariff code, phones carry a 38.5% one-time charge, laptops are reportedly 0%. Needs the owner's customs broker or the Egyptian Customs tariff by tariff code.

## 3. Engineering follow-ups

- **Worker queue.** A backlog of about 66,000 `run-store-expansion` jobs had starved every scheduled job for days (cron jobs that come due go to the head of Bull's wait list whatever their priority). Fixed: expansions are not queued while 100 jobs wait (`STORE_EXPANSION_MAX_WAITING`), and the backlog was purged twice. The queue now holds around 100. Still worth doing: give scheduled jobs their own queue or concurrency so they never wait behind scrapes, and find what keeps asking for expansions (every page that shows an under-covered product).
- **Reports** are generated on demand and by the Monday job; the plan asked for a `reports-generate` queue. Fine at current size.
- **MAP email digest** was not built; alerts go per violation through the notification channels.
- **PDF:** an Arabic label followed by a colon and a Latin value puts the colon on the wrong side (all labels are English today).
- **Mock checkout:** the invoice and redirect work; the payment itself was not completed in the smoke test.
- **Not exercised on real data:** a real MAP violation (needs a product matched to the catalogue; the hourly repricer job connects saved links), the authorized-seller list against a brand with several stores, the seller dashboard with products.
- **Deferred in earlier phases:** Raya and Select (no readable catalogue), grocery and pharmacy stores, review summaries (no review source), repricer auto mode (no official seller API).

## 4. How things are done here

- **Deploy:** `./scripts/deploy-api.sh` (builds, runs unit tests in the image, migrates, swaps, about 25 s of API downtime, then the worker) and `./scripts/deploy-web.sh` (blue/green). Take `pg_dump -Fc` into `~/backups` first. If the proxy config file changed, `podman restart pricelens-proxy`.
- **Run a job now** (the admin routes need a session; the queue can be slow): from inside `pricelens-worker`, either enqueue with `bull` on queue `ingestion` using Redis db `REDIS_QUEUE_DB` (default 1), or call the service directly in a standalone Nest context with `PROCESS_ROLE=api` so it does not consume jobs (`NestFactory.createApplicationContext(AppModule)` from `dist/src/app.module`).
- **Gates before shipping:** API `lint`, `tsc --noEmit`, unit, integration, e2e (`UPDATE_OPENAPI=1` regenerates `docs/openapi.json`); web `lint`, `vitest`, `build`. Use `npx --yes pnpm@11.4.0`. New API routes need a line in `endpoints.e2e-spec.ts`; new config keys go in `test/unit/config-keys.spec.ts` and `.env.example`.
- **Git:** work on a branch, rebase onto `origin/main`, push the branch and `HEAD:main`, then `git merge --ff-only origin/main` in `~/pricelens`. Commits keep the co-author lines for this repo. Other sessions also commit here.
- **Permissions:** Claude Code's auto mode blocks production commands (deploy scripts, `podman exec`, reading container env) unless a Bash permission rule allows them or the session runs with `--dangerously-skip-permissions`.
- **Production reads that work:** `podman exec pricelens-postgres psql -U pricelens -d pricelens`, and curl against https://pricelens.store.
