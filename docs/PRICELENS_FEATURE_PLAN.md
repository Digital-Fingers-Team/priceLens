# PriceLens — Full Feature Expansion Plan

> **For Claude Code.** This is the full implementation plan for turning PriceLens from a free price-comparison tool into a paid product for **buyers, sellers, and companies**. Read it end to end before writing any code, then execute it phase by phase. When everything is done, push to GitHub and deploy (see Phase 9).

---

## 0. Operating rules (read first)

1. **Explore the repo before changing anything.** PriceLens is a Turborepo monorepo: NestJS API + Next.js 14 web, PostgreSQL (pgvector) via Prisma, Redis, BullMQ, Meilisearch. There is an existing 10-step product-matching pipeline and a `PriceSourceProvider` abstraction over scraping providers (ZenRows primary, ScraperAPI fallback). **Extend these — do not rewrite them.** Map every section of this plan onto the actual folder structure you find.
2. **One phase = one branch.** `feat/phase-<n>-<slug>`. For each phase: Prisma migration → backend module(s) → jobs → frontend → tests → `lint` + `typecheck` + `build` pass across the monorepo → commit with clear messages → push → merge into `main`.
3. **Everything behind feature flags + entitlements.** Every feature in this plan is gated by a flag (`FEATURE_<NAME>`) and by plan entitlements (Section 2). A half-finished feature must never break production.
4. **Every external service sits behind an interface** (same pattern as `PriceSourceProvider`). If credentials are missing (Paymob, Telegram bot token, LLM keys…), ship a disabled/mock implementation, keep going, and list what's missing in `DEPLOY_NOTES.md`. Never block the whole plan on one missing key.
5. **No secrets in git.** Add every new variable to `.env.example` with a comment. Check `git diff` for keys before every push.
6. **Arabic-first, RTL-correct UI**, English as second language. All new user-facing strings go through the existing i18n setup (create one if none exists).
7. **Cache aggressively.** Scraping quota is limited — every new data source uses Redis caching and BullMQ scheduling; never scrape synchronously inside a user request if a cached value younger than its TTL exists.
8. **Legal/safety wording:** store names as plain text labels, no official logos. Never label a listing "fake" or "scam" — use neutral, evidence-based wording ("this discount isn't supported by the price history", "new seller, price far below market — check before buying").
9. **Out of scope — do not build:** WhatsApp (bot, alerts, or any WhatsApp integration) and affiliate programs/links of any kind.
10. When a phase is too large for one session, finish complete sub-features rather than starting many and leaving them all half done. Keep a `PROGRESS.md` checklist at repo root updated after each sub-feature.

---

## 1. Shared architecture additions

### 1.1 New provider interfaces (in a shared package, e.g. `packages/core` or wherever `PriceSourceProvider` lives)

| Interface | Purpose | First implementation |
|---|---|---|
| `NotificationChannel` | send alerts | Email, Telegram bot, Web push |
| `PaymentProvider` | subscriptions & invoices | Paymob (Egypt: cards, wallets, Fawry). Stripe-ready interface |
| `InstallmentProvider` | installment plans per product/price | valU, sympl, Aman, Souhoola, bank card plans (config-driven) |
| `OfferSource` | bank-card / cashback / coupon offers | admin-entered + scraped where possible |
| `StoreAdapter` | per-store scraping/parsing | extend existing adapters; add offline chains, used-market, grocery, pharmacy |
| `LLMProvider` | review summaries, advisor, image understanding | Claude API behind interface |
| `FxRateProvider` | USD/EGP etc. | CBE official rate + a market-rate source, both stored |

### 1.2 Entitlements

- `EntitlementsService` reads the user's/organization's plan and returns limits + feature list.
- `@RequiresFeature('price_alerts_realtime')` decorator + guard on NestJS routes; `useEntitlement()` hook in Next.js to show locked states with an upgrade CTA (never hide locked features — show them locked).
- Usage counters in Redis (alerts used, API calls, tracked SKUs) with monthly reset job.

### 1.3 New BullMQ queues

`price-history-snapshot`, `alerts-evaluate`, `alerts-dispatch`, `offers-refresh`, `installments-refresh`, `reviews-summarize`, `seller-monitor`, `repricer`, `rank-tracker`, `map-monitor`, `reports-generate`, `usage-reset`, `fx-refresh`, `trend-radar`.

Each queue: retry with backoff, dead-letter logging, concurrency set via env.

### 1.4 Data model additions (Prisma — adapt names to existing schema)

```
PricePoint        (productOfferId, price, currency, shippingCost, inStock, capturedAt)   -- time series, index (productOfferId, capturedAt)
Plan              (code, audience[BUYER|SELLER|BUSINESS], priceMonthlyEGP, priceYearlyEGP, limits JSON, features String[])
Subscription      (ownerType[USER|ORG], ownerId, planCode, status, provider, providerRef, currentPeriodEnd)
Invoice           (subscriptionId, amount, status, provider, providerRef, paidAt)
Organization      (name, type[SELLER|BRAND|DISTRIBUTOR|RESEARCH|PROCUREMENT], members)
OrgMember         (orgId, userId, role)
PriceAlert        (userId, productId|cartId, targetPrice, channel, frequency, active)
CartWatch         (userId, name, targetTotal) + CartWatchItem(productId, qty)
InstallmentPlan   (provider, months, interestRate, adminFee, downPayment, minAmount, maxAmount, storeScope, validUntil)
Offer             (type[CARD|CASHBACK|COUPON], store, bank?, code?, value, valueType, minSpend, validFrom, validUntil, lastVerifiedAt, verified)
Warranty          (productId, storeOfferId, type[LOCAL_AGENT|INTERNATIONAL|SELLER|NONE], months, agentName)
SellerProfile     (store, externalSellerId, name, ratings, reviewsCount, firstSeenAt, trustScore, flags JSON)
ReviewSummary     (productId, lang, pros[], cons[], commonIssues[], sampleSize, generatedAt)
Store             (add: kind[ONLINE|OFFLINE_CHAIN|USED_MARKET|GROCERY|PHARMACY])
SellerListing     (orgId, store, externalListingId, productId, cost, floorPrice, ceilingPrice, repricerRule JSON, autoReprice Boolean)
PlatformFeeTable  (store, category, commissionPct, fixedFee, shippingModel JSON, vatPct, updatedAt)   -- admin-editable, NEVER hard-code fees
RankSnapshot      (sellerListingId, keyword, position, capturedAt)
MapPolicy         (orgId, productId, minAdvertisedPrice, authorizedSellers[])
MapViolation      (policyId, store, sellerProfileId, observedPrice, capturedAt, evidenceUrl, status)
FxRate            (base, quote, source[CBE|MARKET], rate, capturedAt)
ApiKey            (orgId, hashedKey, scopes[], rateLimit, lastUsedAt) + ApiUsage(apiKeyId, endpoint, count, day)
Report            (orgId, type, params JSON, status, fileUrl, createdAt)
ProcurementRequest(orgId, items JSON, status, quotePdfUrl)
```

---

## 2. Plans & pricing (seed data, all admin-editable)

| Plan | Audience | Core entitlements |
|---|---|---|
| **Free** | Buyer | search & compare, 3 price alerts (daily email), 30-day history chart, basic landed cost |
| **Pro** | Buyer | unlimited alerts, real-time Telegram / web push, full history + buy-now/wait estimate, fake-discount check, cart watch, installment comparison, card/cashback offers, verified coupons, review summaries, image search, advisor |
| **Seller** | Small sellers | seller dashboard, competitor monitoring, new-competitor alerts, profit calculator, best-platform finder, repricer (suggestion mode), rank tracking (limited keywords) |
| **Seller Plus** | Serious sellers | auto-repricer where platform API allows, more SKUs/keywords, import-opportunity finder, trend radar, FX tracking |
| **Business** | Brands / distributors / research / procurement | MAP monitoring, unauthorized-seller detection, market reports, Price API (metered), procurement quotes, multi-seat org |

Prices are placeholders in seed data; the owner will set real EGP prices from the admin panel.

---

## 3. Phase 1 — Foundation (everything else depends on this)

1. **Price history capture** — every successful price fetch writes a `PricePoint`. Scheduled snapshot job for tracked/popular products. Retention: raw 90 days, daily aggregates forever.
2. **Plans, subscriptions, entitlements** — models above, `EntitlementsService`, guard, frontend hook, locked-state UI, pricing page (`/pricing`) in Arabic + English.
3. **Billing** — `PaymentProvider` with Paymob implementation: checkout, webhook handling (verify HMAC), subscription activation/renewal/cancellation, invoices page. Graceful downgrade when payment fails.
4. **Organizations** — create org, invite members, roles (owner/admin/member). Seller and Business plans attach to orgs, Pro attaches to users.
5. **Admin panel** (protected route) — manage plans, offers, installment plans, platform fee tables, warranty data, feature flags.

**Acceptance:** a user can subscribe to Pro in test mode, entitlements flip immediately, a locked feature becomes available, cancellation downgrades at period end.

---

## 4. Phase 2 — Buyer Pro essentials

1. **Outbound click tracking** — all outbound "go to store" clicks go through `/go/:offerId`, which logs the click and redirects to the plain store URL. **No affiliate programs are used** — do not add affiliate tags, affiliate link builders, or any revenue that depends on affiliate income. Click analytics in admin (clicks per store/product are valuable data for the seller and business tiers).
2. **Price alerts** — per product target price or "any drop". Free: 3 alerts, daily email digest. Pro: unlimited, real-time via Telegram / web push. Dedupe so users don't get spammed for the same drop.
3. **Price history chart** — 30 days free, full history for Pro. Show lowest / highest / average and "current vs. average".
4. **Buy now or wait estimate** — start with a transparent heuristic (position vs. historical range, seasonality around known sale events such as White Friday / Ramadan / back-to-school, recent trend). Always label it as an estimate with a confidence level. Keep the model swappable.
5. **Fake-discount check** — compare the store's "was" price with actual recorded history; if the "was" price never appeared (or only briefly right before the sale), show neutral warning text.
6. **True landed cost** — product price + shipping + customs/VAT estimate (for cross-border stores like AliExpress/eBay/Amazon.com) + FX conversion, computed to the buyer's door in EGP. Customs/VAT rates come from an admin-editable table, not hard-coded.

**Acceptance:** alerts fire within one job cycle of a price drop; the discount check and landed cost render on the product page with clear explanations.

---

## 5. Phase 3 — Buyer differentiators (the Egypt-specific ones)

1. **Installment comparison** — for any price, list plans from valU, sympl, Aman, Souhoola, and bank-card plans: monthly payment, total paid, effective extra cost %, down payment, eligible stores. Data is admin-entered + refreshed where a public source exists. Include a clear "check final terms with the provider" note.
2. **Card & cashback offers** — "Pay with <bank> card on <store> today and save X". Shown on product and store pages, filtered by the user's saved cards (user picks bank names only — **never store card numbers**).
3. **Verified coupons** — coupons with `lastVerifiedAt`; show only verified or recently working codes; users can report "didn't work", which lowers ranking.
4. **Warranty info** — local agent vs. international vs. seller warranty per offer, surfaced next to price, with a note when a cheaper offer has weaker warranty.
5. **Seller trust score** — from ratings, review count, seller age, price far below market, return policy. Show a neutral caution badge for risky combos.
6. **Arabic review summaries** — `LLMProvider` summarizes reviews into pros / cons / common issues in Arabic (and English), cached per product, regenerated when reviews change meaningfully. Show sample size.
7. **Cart watch** — watch a basket of products; alert when the total (optionally across stores) drops below a target.

---

## 6. Phase 4 — Coverage expansion

1. **Offline chains** — B.TECH, 2B, Raya, Select, Tradeline, Carrefour electronics (via their websites). `Store.kind = OFFLINE_CHAIN`; UI shows "online vs. in-store price" side by side.
2. **Used market** — Dubizzle/OLX-style listings: show "used, good condition from ~X" range next to new price. Aggregate ranges, don't expose private sellers' personal data.
3. **Grocery** — Breadfast, Carrefour, Talabat Mart and similar: weekly basket comparison, unit price (per kg/liter) normalization.
4. **Pharmacy (non-prescription consumer items only)** — price comparison for OTC/cosmetics/baby products across online pharmacies. No medical advice, no prescription drugs.

Each new store: `StoreAdapter`, matching-pipeline integration, TTL config, Meilisearch indexing, tests with saved HTML fixtures.

---

## 7. Phase 5 — New input channels

1. **Image / screenshot search** — upload a photo of a product or a screenshot (Instagram post, store page); extract text/brand/model via `LLMProvider` vision + OCR, then run the existing matching pipeline. Return best prices.
2. **Telegram bot** — user sends a link, product name, or photo → bot replies with cheapest options, installment best plan, and a link to the product page. Rate-limited per plan.
3. **"What should I buy?" advisor** — chat-style: "laptop for programming, 30k EGP" → 3 recommendations with current prices, why each fits, and trade-offs. Grounded only in products and prices in our DB (no invented specs/prices).

---

## 8. Phase 6 — Seller tools

1. **Seller dashboard** — connect listings by URL or CSV import; link each to a canonical product via the matching pipeline; enter cost price.
2. **Competitor monitoring** — every competitor offer on the same product across platforms; price-change timeline; alerts on changes.
3. **New-competitor alert** — notify when a new seller lists the same product, especially below the seller's price.
4. **Profit calculator** — selling price − platform commission − fixed fees − shipping − expected returns − VAT − cost = net profit, per platform, using `PlatformFeeTable` (admin-maintained; show "last updated" date).
5. **Best-platform finder** — for a product, compare expected net profit and market price across Noon / Jumia / Amazon.eg / others.
6. **Repricer**
   - **Suggestion mode (all Seller plans):** rules like "stay X EGP below the lowest competitor, never below floor, never above ceiling"; the job produces recommended prices + CSV export.
   - **Auto mode (Seller Plus):** only through official seller APIs where available and the seller has connected their account. If no official API exists for a platform, auto mode is unavailable for it — never automate a seller's account through scraping or credential storage.
   - Full audit log of every price change.
7. **Search rank tracking** — track the seller's listing position for chosen keywords on each platform over time.

---

## 9. Phase 7 — Importers & traders

1. **Import-opportunity finder** — products where (AliExpress/1688/Amazon.com landed cost) is far below the Egyptian market price and demand signals are high (review velocity, number of sellers, price stability). Ranked list with estimated margin.
2. **FX tracking** — CBE official and market USD/EGP rates stored over time; show how FX changes affect landed cost and margins for tracked products.
3. **Trend radar** — weekly: categories/products with rising demand signals and price moves.

---

## 10. Phase 8 — Business / enterprise

1. **MAP monitoring** — brand defines minimum advertised price per product and authorized sellers; `map-monitor` job records violations with evidence (price, time, URL, screenshot if feasible); violations dashboard + email digest + CSV export.
2. **Unauthorized-seller detection** — sellers listing the brand's products who aren't on the authorized list.
3. **Market reports** — category average prices, discount frequency, price-change timeline per brand, share of offers per store. Generated async (`reports-generate`) as PDF + CSV.
4. **Public Price API** — REST endpoints (search, product prices, history, offers) with API keys, scopes, per-key rate limiting, metered usage (`ApiUsage`), OpenAPI docs page.
5. **Procurement quotes** — company submits a list ("50 laptops, spec X, budget Y") → best offers per item across stores, totals, delivery notes → exportable quotation PDF.

---

## 11. Phase 9 — QA, GitHub, deploy

1. **Tests:** unit tests for pricing math (landed cost, installments, profit calculator, repricer rules), integration tests for billing webhooks and alerts, fixture tests for every new `StoreAdapter`. All green.
2. **Full monorepo checks:** `lint`, `typecheck`, `build`, `test` pass.
3. **Docs:** update `README.md` (features, env vars, how to run jobs), write `DEPLOY_NOTES.md` (required credentials, which integrations are disabled pending keys, migration notes), finalize `PROGRESS.md`.
4. **GitHub:** push all phase branches, merge into `main` (PRs if the repo uses them), tag release `v2.0.0`. The repo is under the `Digital-Fingers-Team` GitHub organization — use the existing remote; do not create a new repository unless none exists.
5. **Deploy:**
   - Detect the **existing** deployment setup first (Dockerfile / docker-compose, `vercel.json`, Railway, Render, Fly, GitHub Actions workflows, VPS scripts) and use it.
   - Run Prisma migrations against production safely (`prisma migrate deploy`), after a DB backup if the platform allows.
   - Make sure worker processes for the new BullMQ queues are deployed and running, not just the API/web.
   - Production domain: **pricelens.work.gd**.
   - If there is no deployment setup at all, **stop and ask the owner** which host to use rather than choosing a paid provider on their behalf.
6. **Smoke test after deploy:** home, search, product page, pricing page, test-mode checkout, one alert end to end, seller dashboard loads, API key request succeeds. Report results in `DEPLOY_NOTES.md`.

---

## 12. Final report (what to tell the owner when done)

- What shipped per phase, what is behind a flag, what is disabled pending credentials.
- List of env vars / accounts the owner must create (Paymob, Telegram bot, LLM key, etc.).
- Live URL and smoke-test results.
