# Store operations tools

Manual tools for keeping the browser-driven store connectors working. None
of them run automatically. Run them from `apps/api` with the environment of
the deployment you are fixing, usually inside the API container, where the
browser profiles live (`.browser-profiles`, a persistent volume in production).

| Tool | Use it when |
|---|---|
| `login-store.ts` | A connector needs a one-time login or warm-up of its persistent Chrome profile (`pnpm login:noon`, `login:alibaba`, `login:amazon`). |
| `solve-captcha.ts` | A store shows a CAPTCHA: opens its page on the virtual display for a person to solve over noVNC (`ENABLE_NOVNC=true`, see `docker/entrypoint.api.sh`). |
| `diagnose-stores.ts` | A store stops producing listings: runs every connector on the same queries and shows what each returns. |
| `probe-stores.ts` | Checks what each store's search page returns in the connectors' browser (status, title, product-card count). |
| `probe-dom.ts` | A store changed its markup: dumps the page's HTML around a selector so the connector can be rebuilt. |
| `probe-cookies.ts` | Prices come back in the wrong currency or region: shows which cookies carry currency or locale. |
| `probe-turnstile.ts` | A Cloudflare Turnstile challenge blocks a store: checks whether clicking it gets through. |

Usage lines are at the top of each file, e.g. `npx ts-node scripts/ops/diagnose-stores.ts noon "iphone 15"`.

One-off data fixes that used to live in `scripts/` (backfills, merges and
unmerges) were removed after they had been applied; they remain in git
history. Their row backups are in the repo-root `backups/` directory
(untracked).
