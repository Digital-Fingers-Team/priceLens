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

## Phase 3 — Buyer differentiators (`feat/phase-3-buyer-differentiators`)
- [x] Installment comparison: admin-entered plans (valU, sympl, Aman, Souhoola, bank cards) priced against the cheapest eligible store: monthly, total, extra %, down payment; "check final terms" note. No terms seeded: nothing invented
- [x] Card & cashback offers: per bank / store, filtered and ranked by the buyer's saved banks (`/account/banks`, names only, never card numbers)
- [x] Verified coupons: shown only when admin-verified ≤30 days or reported working ≤14 days; "worked / didn't" votes (one per buyer) push broken codes out
- [x] Warranty: admin rules per store + brand; shown per offer, with a note when the cheapest offer's warranty is weaker
- [x] Seller caution: neutral note when an offer is far below the market and its feedback is weak **or unknown** (stores don't give us sellers or reviews; worded as "we can't see", never as a verdict)
- [ ] Arabic review summaries: **moved to phase 5**. No connector collects review text (all stores are browser-scraped, ratings are not even captured), so it needs a per-product review crawl; built there with the LLM provider. Tables (`product_reviews`, `review_summaries`) are in place
- [x] Cart watch: baskets with a target total, each item at its cheapest store or all from one store; hourly sweep alerts once when reached, re-arms above (`/cart-watch`, "Add to basket" on the product page)
- [x] Admin: `/admin/buyer-offers` (installments, offers & coupons, warranty)

## Phase 4 — Coverage expansion (`feat/phase-4-coverage`)
- [x] Store kinds (`platforms.kind`: ONLINE, OFFLINE_CHAIN, USED_MARKET, GROCERY, PHARMACY). B.TECH, 2B, Elaraby, Dream 2000 marked as chains with branches; offers show "Has stores" with "the in-store price can differ" (we can only read website prices, so there is no separate in-store price to show)
- [x] New chains: **Tradeline** and **Compumarts** (Shopify search, plain HTTP)
- [ ] Raya, Select: Raya's storefront loads results client-side (needs a browser connector); Select has no reachable catalogue. Deferred
- [x] Used market: OpenSooq search pages → title-matched (Arabic/English, variant and accessory guards) asking prices → a 25th–75th percentile range, nightly for up to 120 watched / viewed products. **Aggregates only**: no listing, seller, phone or place is stored. Dubizzle answers a CAPTCHA, so it is not used
- [x] Unit price (per kg / litre) from size-labelled titles, on the product page
- [ ] Grocery stores (Breadfast, Talabat Mart) and pharmacies (El Ezaby, Chefaa, Yodawy): app-first or bot-walled; none exposes a catalogue we can read over the web. Deferred until a reachable source exists

## Phase 5 — New input channels (`feat/phase-5-input-channels`)
- [x] LLM layer behind one interface: Gemini (default, reuses the search keys) then Claude when `ANTHROPIC_API_KEY` is set; a failing provider is paused and the next one tried; every answer is validated before use
- [x] Image / screenshot search (Pro): photo → recognised product → normal search. JPEG/PNG/WebP up to 5 MB, kept in memory only, never stored; daily cap per user (`IMAGE_SEARCH_DAILY_LIMIT`)
- [x] Advisor (Pro, `/advisor`): the model only rewrites the request into a search and picks among Deal Hunter results; it never supplies products or prices (picks are checked against the candidate ids). Without a model, Deal Hunter's top 3 are shown. Daily cap (`ADVISOR_DAILY_LIMIT`)
- [x] Telegram bot: `/start` links the account with the existing verification code, a product name or store link returns the best prices, a photo searches by image for Pro users. Per-chat daily limit (10 free / 100 paid). Webhook authenticated by `TELEGRAM_WEBHOOK_SECRET`
- [ ] Review summaries: no review text is collected yet (tables exist since phase 3). Deferred until a review source is crawled

## Phase 6 — Seller tools (`feat/phase-6-seller-tools`)
- [x] Add products by store link or CSV (sku, name, cost, price, url; Arabic or English headers; up to 500 per file). A link we already track connects the product to the catalogue at once; other links are connected by the hourly job once crawled
- [x] Competitor timeline: each store's daily lowest over 90 days (from `price_daily`), with the workspace's competitor events
- [x] New-competitor alert: existing `NEW_ENTRANT` events now raise a WARNING, with "below your price" in the notification, when the newcomer undercuts the seller
- [x] Profit calculator per platform: price − commission − fixed fee − shipping − expected returns − VAT (inside the price) − cost, plus the break-even price; fees from admin-maintained `platform_fee_tables` (per store, optionally per category) with "last updated" shown
- [x] Best-platform finder: net profit at each store's current price (or the seller's own where that store has no offer), ranked
- [x] Repricer, suggestion mode: beat or match the cheapest in-stock competitor, never below the floor or above the ceiling; hourly job; CSV export; full audit log (suggested / applied / edited / imported) in `price_change_logs`
- [ ] Repricer auto mode (Seller Plus): no official seller API is connected for any store, so it is unavailable everywhere and says so. Never via scraping or stored credentials
- [x] Search rank tracking: keyword + store, checked daily in the store's own search (first 48 results), 60-day history
- [x] Admin: `/admin/fee-tables`. **No fees are seeded**: the owner enters them from each store's published seller fee schedule
## Phase 7 — Importers & traders (`feat/phase-7-importers`)
- [x] FX tracking: `FxRateProvider` interface; CBE official buy/sell (its public rates page, no key) and the market reference (`FX_RATES_API_URL`, the rate ingestion converts at), one row per source, currency and day in `fx_rates` (USD, EUR, GBP, CNY, SAR, AED); refreshed twice a day. Today's rates are public; history and impact are Seller Plus
- [x] FX impact: for watchlist and workspace products sold by a cross-border store, landed cost now, a month ago, and at −10 % … +20 % on the dollar, margin against the cheapest local price, and the dollar rate at which importing stops paying
- [x] Import-opportunity finder: nightly rebuild of `import_opportunities` from current prices (no scraping). Cross-border = a store with a landed-cost rule (AliExpress, Alibaba). Margin vs the median of local stores' lowest; demand = local stores, interest (views, clicks, watchlist adds, alerts), reviews, 30-day local price stability. Margins ≥ 60 % are capped in the ranking and flagged "check it is the same item"
- [x] Trend radar: weekly (Saturday–Friday, Cairo) `trend_signals` for categories and products: new listings / stores, interest, median week-on-week move of the lowest price. New listings include stores we just started covering; the page says so
- [x] `/importers` page (three tabs, Arabic + English), navbar link; admin endpoints to run each job now

## Phase 8 — Business (`feat/phase-8-business`)
- [x] MAP: `/business/{org}` MAP tab: set a MAP per product, violations table with evidence (price, time, listing link), acknowledge, CSV export. Per-violation notifications already existed
- [x] Authorized sellers: brand ticks its approved stores (`authorized_retailers`); listings of its products at other stores are listed, with "below MAP" marked. Nothing is reported until at least one store is ticked
- [x] Reports: three new sections (average prices by category, discount frequency by store, share of offers per store), PDF and CSV download, UI with the generated reports. Generation stays on-demand plus the Monday job (cheap database aggregates, no queue needed)
- [x] Public API: key UI (create with scopes, copy once, revoke, 30-day usage), `GET /partner/search`, and the public `/developers` documentation page. Swagger is off in production, so the page is the documentation
- [x] Procurement quotes (`procurement_quotes`, `/procurement/workspaces/{org}/quotes`): one line per item (name, quantity, budget), matched by search (drops trailing words when nothing matches, and shows the matched title), lowest live offer per line with other stores' prices, totals, over-budget flag, final status, PDF and CSV. No delivery terms are held, so the quote says to confirm them
- [ ] MAP email digest: alerts go through the notification channels per violation (email once SMTP is set); no separate digest

## Phase 9 — QA, GitHub, deploy
- [x] Tests: pricing math (landed cost, installments, profit, repricer, FX, trade), billing webhooks and manual payments, alert integration, fixture tests for the Shopify-search chains, B.TECH, OpenSooq and the CBE rates page; e2e covers every route
- [x] Full checks: lint, typecheck, unit, integration, e2e, web tests, API and web builds
- [x] README (features, jobs), DEPLOY_NOTES (credentials, per-phase notes, release checklist)
- [ ] Deploy phase 8 and smoke test: owner steps in DEPLOY_NOTES "Release checklist" (Claude is blocked from production)
- [ ] Tag v2.0.0 after the deploy
