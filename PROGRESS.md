# PriceLens v2 expansion — progress

Tracks [`docs/PRICELENS_FEATURE_PLAN.md`](docs/PRICELENS_FEATURE_PLAN.md) (the owner's plan) against the code. Updated after every sub-feature.

## How the plan maps onto this repo

The plan was written generically; where it disagrees with the repo, the repo's existing decisions win:

| Plan says | Repo reality | What we do |
|---|---|---|
| BullMQ, one queue per job | Bull, one `ingestion` queue with named jobs (`workers/ingestion.jobs.ts`) | New jobs are named jobs on that queue, same scheduler, same retry/backoff |
| Meilisearch indexing | No search engine; Postgres `pg_trgm` search (ADR 0003) | New stores are searchable through the existing search SQL |
| ZenRows / ScraperAPI `PriceSourceProvider` | Patchright Chrome + HTTP `RetailerConnector`s in `ConnectorRegistry` | New stores are new `RetailerConnector`s |
| `PricePoint` table | `price_history`, one row per price *change* | Keep it; add a daily rollup (`price_daily`) |
| Plans Free / Pro / Seller / Seller Plus / Business | `plans` rows: free, plus_monthly (Pro), seller_monthly, enterprise_monthly (Business) | Add `seller_plus_monthly`; names stay admin-editable |
| `Subscription(ownerType USER/ORG)` | Subscriptions are per user; an org's seats and SKUs come from its owner's plan | Unchanged |
| Paymob | Stripe (inert, no keys) + wallet/InstaPay manual payments (live) | Paymob is added as a third `PaymentProvider` |
| LLM = Claude | Gemini key/model chain already used by the match judge | `LLMProvider` with Gemini and Claude implementations |
| No affiliate links | Live affiliate module (`/affiliate/go/:listingId`, Impact) | **Kept as is: owner decision, 2026-10-01** |

Deploys go out after every phase (owner decision, 2026-10-01): pg_dump, then `scripts/deploy-api.sh`, then `scripts/deploy-web.sh`.

## Already in place before this plan

Entitlements service + `@RequiresFeature` guard + `useEntitlements()` hook + `UpgradePrompt` · plans/subscriptions/events · Stripe checkout + webhooks · wallet/InstaPay payments with admin approval · organizations + members + roles · price history + 30-day free window · alert engine (7 alert types, repeat + cooldown) · notifications (in-app, email, Telegram; inert without keys) · buy/wait verdict · deal score · fake-discount check · Deal Hunter · seller workspaces, competitor events/alerts, margin pricing, market position · brand MAP monitoring, distribution, launch detection, market reports · public API keys with scopes, daily quotas, usage · admin dashboard, review queue, payments, analytics · Arabic-first i18n.

## Phase 1 — Foundation (`feat/phase-1-foundation`)

- [x] Feature flags: `feature_flags` table, `FEATURE_<KEY>` env defaults, `/admin/flags`, flag-aware `FeatureGuard` (+ `@RequiresFlag`), public `GET /flags`, web `useFlags()` / `useEntitlement()` (hidden / locked / available)
- [x] Plan feature keys for every v2 feature; `seller_plus_monthly`; data migration adds the new keys to existing plan rows
- [x] `PaymentProvider` interface; Paymob (Intention API + Unified Checkout, HMAC-verified callback); test double behind `mock_checkout` (admin-only in production). Stripe keeps its native recurring flow.
- [x] Invoices: `invoices` table, `/account/invoices` (online + wallet/InstaPay in one list, live status on return from the gateway), idempotent settlement, amount check, early renewal stacks
- [x] Renewal reminder 3 days before a wallet/Paymob period ends; lapse → free tier (existing expiry job)
- [x] Workspace invitations by link for people with or without an account (hashed token, email-bound, 7 days, holds a seat); Team panel on the workspace page
- [x] Admin: plans editor (`/admin/plans`), feature flags (`/admin/flags`)
- [x] Price history daily rollup (`price_daily`, Cairo days) + `run-price-rollup` job. Raw pruning deliberately not done: raw rows are written only on change and the verdict reads them.

## Phase 2 — Buyer Pro essentials (`feat/phase-2-buyer-pro`)
- [x] Outbound clicks: `/affiliate/go/:listingId` already logs every click (affiliate kept, owner decision); admin analytics now shows clicks per store **and** the most clicked products
- [x] Alerts: Free = in-app at once + one daily email digest; Pro = real-time email, Telegram and the new browser push channel (`realtime_alerts` flag). Dedupe/cooldown existed and still applies
- [x] Browser push (Web Push, our own VAPID keys): `WEB_PUSH` channel, service worker, "turn on in this browser" on /account/notifications; expired subscriptions retire themselves
- [x] History chart stats: 52-week / all-time low and high, and the verdict card's period low / average / high — already existed
- [x] Buy-now-or-wait: sale calendar (White Friday, Ramadan, back-to-school) adds a reason and turns "fair" into "wait" within 14 days of a sale; still labelled with a confidence level
- [x] Discount check: existed; wording made neutral ("not supported by the price history")
- [x] Landed cost: admin-editable `landed_cost_rules` (per store, optional per category), card on the product page with the assumptions spelled out, breakdown for plans with `landed_cost_detail`, compared with the cheapest local price

## Phase 3 — Buyer differentiators
- [ ] Installment comparison · [ ] Card & cashback offers · [ ] Verified coupons · [ ] Warranty info · [ ] Seller trust score · [ ] Arabic review summaries · [ ] Cart watch

## Phase 4 — Coverage expansion
- [ ] Offline chains (B.TECH and 2B exist; Raya, Select, Tradeline) · [ ] Used market ranges · [ ] Grocery + unit price · [ ] Pharmacy (OTC only)

## Phase 5 — New input channels
- [ ] Image / screenshot search · [ ] Telegram bot · [ ] Advisor

## Phase 6 — Seller tools
- [ ] Listing import (URL/CSV) · [ ] Competitor timeline (exists: verify) · [ ] New-competitor alert (exists: verify) · [ ] Profit calculator + `platform_fee_tables` · [ ] Best-platform finder · [ ] Repricer (suggestion mode, audit log) · [ ] Rank tracking

## Phase 7 — Importers & traders
- [ ] Import-opportunity finder · [ ] FX tracking (CBE + market) · [ ] Trend radar

## Phase 8 — Business
- [ ] MAP (exists: add UI) · [ ] Unauthorized sellers (distribution exists: add UI) · [ ] Reports (exist: add PDF/CSV + UI) · [ ] Public API (exists: add key UI + docs page) · [ ] Procurement quotes

## Phase 9 — QA, GitHub, deploy
- [ ] Tests · [ ] README / DEPLOY_NOTES · [ ] tag v2.0.0 · [ ] smoke test
