# PriceLens platform expansion — status

Branch: `feat/price-intelligence-platform`

## Verified in production

| Stage | Scope | State |
|---|---|---|
| 1 | Billing, entitlements, notifications, price intelligence, alert engine | **Deployed & verified** |
| 2 | Deal Hunter (natural-language search) | **Deployed & verified** |
| 3 | Seller workspaces, mapping, positioning, margin pricing, competitor detection | **API deployed & verified**; UI written, not yet built |

## Written but NOT yet verified

Everything below was written while the server was intentionally stopped, so it
has **not been typechecked, tested, migrated or deployed**. Treat it as a
first draft until the gates below have run.

| Stage | Scope |
|---|---|
| 3 | Seller UI: workspace list, dashboard, product detail, competitor activity feed |
| 4 | MAP monitoring, distribution tracking, launch detection, market reports |
| 5 | Enterprise API: hashed keys, scopes, per-key daily quotas, usage tracking |

## To do when the stack is back up

Run in this order — each step gates the next:

```bash
# 1. Generate the stage 4/5 migration against the live schema.
#    It MUST be reviewed before applying: `migrate diff` repeatedly proposes
#    dropping six production indexes that the Prisma datamodel cannot express
#    (pgvector HNSW, two pg_trgm, two covering, one BRIN). Strip every
#    DropIndex block, exactly as the two existing migrations document.
podman exec pricelens-api sh -lc \
  'node /repo/node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/build/index.js \
   migrate diff --from-schema-datasource prisma/schema.prisma \
   --to-schema-datamodel prisma/schema.prisma --script'

# 2. Typecheck, lint, test.
# 3. Apply the migration (deploy-api.sh does this before swapping).
# 4. ./scripts/deploy-api.sh && ./scripts/deploy-web.sh
```

## Known gaps

- **Brand and enterprise UI are not built.** The APIs exist; there are no
  pages for MAP violations, distribution, discoveries, reports or API keys.
- **Price history is still too shallow for verdicts.** Products average ~6
  days of observations; the Buy/Wait verdict needs 10 days over a 14-day span
  and correctly returns `INSUFFICIENT_DATA` until then. This resolves with
  time, not code.
- **Stock is known for ~3% of listings.** Amazon's parser change is written
  but unverified (its scraper hits bot detection intermittently); Noon's is
  confirmed working. Restock alerts stay mostly inert until coverage improves.
- **Stripe is code-complete but inert** — no keys configured.
- **Email/Telegram delivery is inert** — no SMTP host or bot token configured.
  Deliveries record as SKIPPED, not FAILED, so nothing accumulates a backlog.
