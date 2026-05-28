# PriceLens

A production-grade cross-platform price comparison engine. One search aggregates matching listings across Amazon, Newegg, Best Buy, B&H, and Walmart — then groups them under canonical products using a 10-step layered matching pipeline.

---

## Architecture

```
pricelens/
├── apps/
│   ├── api/          # NestJS backend (REST API + workers)
│   └── web/          # Next.js 14 frontend (App Router)
├── packages/
│   └── shared/       # Shared TypeScript types (optional)
├── docker-compose.yml        # Local dev services
├── docker-compose.prod.yml   # Production services
└── turbo.json                # Turborepo pipeline
```

### Backend (NestJS)
- **Auth**: JWT access tokens (15m) + refresh tokens (7d) with rotation. Stored in localStorage on client, httpOnly-safe pattern.
- **Matching Engine**: 10-step pipeline — normalize → extract → exact ID → brand/model → fuzzy → semantic → image → price sanity → category → confidence score. Auto-accept ≥ 0.88, review queue 0.60–0.87, reject < 0.60.
- **Search**: Meilisearch with typo-tolerance. Falls back to Postgres `pg_trgm` if Meilisearch is down.
- **Workers**: BullMQ queues for scraping, matching, and alert checks. Alert check runs every 30 minutes via cron.
- **Database**: PostgreSQL 16 with `pgvector` (semantic embeddings), `pg_trgm` (fuzzy candidate lookup), `uuid-ossp`.

### Frontend (Next.js 14 App Router)
- **Server state**: TanStack Query (React Query) — no server data in Zustand
- **UI state only**: Zustand (search filters, toasts, modals)
- **Forms**: react-hook-form + Zod validation
- **Charts**: Recharts with custom dark theme
- **Auth**: Token refresh queue (prevents double-refresh race condition)

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20.0 |
| pnpm | 11.4.0 |
| Docker + Docker Compose | Latest |
| Git | Any |

---

## Local Development Setup

### 1. Clone and install

```bash
git clone https://github.com/your-org/pricelens.git
cd pricelens
pnpm install
```

### 2. Start infrastructure services

```bash
docker compose up -d
```

This starts:
- **PostgreSQL 16** with pgvector on `localhost:5432`
- **Redis 7** on `localhost:6379`
- **Meilisearch v1.6** on `localhost:7700` (UI at http://localhost:7700)

Wait for them to be healthy:
```bash
docker compose ps
```

### 3. Configure the API

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` — the defaults work for local Docker setup **except**:

```env
# Required — generate secure secrets:
JWT_ACCESS_SECRET=<run: openssl rand -base64 64>
JWT_REFRESH_SECRET=<run: openssl rand -base64 64>

# Optional — enables semantic matching (otherwise fuzzy-only):
OPENAI_API_KEY=sk-...
```

Generate secrets quickly:
```bash
echo "JWT_ACCESS_SECRET=$(openssl rand -base64 64)"
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 64)"
```

### 4. Configure the frontend

```bash
cp apps/web/.env.example apps/web/.env.local
```

`apps/web/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

### 5. Run database migrations and seed

```bash
# Generate Prisma client
pnpm db:generate

# Run migrations (creates all tables, indexes, extensions)
pnpm db:migrate

# Seed with categories, platforms, and admin users
pnpm db:seed
```

Seed creates:
- **Categories**: Electronics → Laptops, Graphics Cards, Smartphones
- **Platforms**: Amazon, Newegg, Best Buy, B&H Photo, Walmart
- **Users**: `admin@pricelens.dev` / `admin_dev_password_change_me`

### 6. Start development servers

```bash
pnpm dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:3001/api/v1 |
| Swagger Docs | http://localhost:3001/docs |
| Meilisearch | http://localhost:7700 |
| Prisma Studio | `pnpm db:studio` → http://localhost:5555 |

---

## Environment Variables Reference

### `apps/api/.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_HOST` | ✅ | Redis hostname |
| `REDIS_PORT` | ✅ | Redis port |
| `REDIS_PASSWORD` | ✅ | Redis password |
| `MEILISEARCH_URL` | ✅ | Meilisearch base URL |
| `MEILISEARCH_KEY` | ✅ | Meilisearch master key |
| `JWT_ACCESS_SECRET` | ✅ | Access token signing secret |
| `JWT_REFRESH_SECRET` | ✅ | Refresh token signing secret |
| `JWT_ACCESS_TTL` | ✅ | Access token TTL (e.g. `15m`) |
| `JWT_REFRESH_TTL` | ✅ | Refresh token TTL (e.g. `7d`) |
| `OPENAI_API_KEY` | ⬜ | Enables semantic matching via embeddings |
| `PORT` | ⬜ | API port (default: 3001) |
| `NODE_ENV` | ⬜ | `development` or `production` |
| `FRONTEND_URL` | ⬜ | CORS allowed origin |

### `apps/web/.env.local`

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | ✅ | Full API base URL including `/api/v1` |

---

## API Documentation

Interactive Swagger docs available at http://localhost:3001/docs when `NODE_ENV=development`.

### Key Endpoints

```
# Auth
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
GET    /api/v1/auth/me

# Search
GET    /api/v1/search?q=rtx+4090&minPrice=500&maxPrice=2000
GET    /api/v1/search/suggest?q=rtx

# Products
GET    /api/v1/products                    # paginated list
GET    /api/v1/products/:slug              # detail + source listings
GET    /api/v1/products/:id/listings       # all matched store listings

# Prices
GET    /api/v1/prices/:productId/history   # chart data (days=90)
GET    /api/v1/prices/:productId/current   # current prices per platform
GET    /api/v1/prices/:productId/stats     # all-time + 52-week stats

# Watchlist (auth required)
GET    /api/v1/watchlist
POST   /api/v1/watchlist
DELETE /api/v1/watchlist/:productId
POST   /api/v1/watchlist/:productId/alerts
DELETE /api/v1/watchlist/alerts/:alertId

# Admin (MODERATOR/ADMIN role required)
GET    /api/v1/admin/dashboard
GET    /api/v1/admin/review-queue
PATCH  /api/v1/admin/review-queue/:id/resolve
POST   /api/v1/scraping/trigger
POST   /api/v1/admin/rematch
```

---

## Matching Engine

The pipeline runs on every ingested source listing:

| Step | Description | Hard reject? |
|------|-------------|--------------|
| 0 | Accessory guard | ✅ |
| 1 | Title normalization | — |
| 2 | Attribute extraction | — |
| 3 | Exact identifier (GTIN/UPC/EAN/MPN) | Shortcircuits to accept |
| 4 | Brand/model consistency | Penalizes score |
| 5 | Fuzzy title (Levenshtein + Jaccard) | — |
| 6 | Semantic similarity (pgvector + OpenAI) | — |
| 7 | Image similarity | Pending (neutral 0.5) |
| 8 | Price sanity vs. median | Penalizes extremes |
| 9 | Category constraint | — |
| 10 | Weighted confidence score | Routes to accept/review/reject |

**Thresholds:**
- `≥ 0.88` → Auto-accept
- `0.60 – 0.87` → Review queue
- `< 0.60` → Rejected

**Hard rules (never merged regardless of score):**
- Different storage sizes (512GB ≠ 1TB)
- Different RAM configurations
- Different variant suffixes (Ti ≠ Super, Pro ≠ Pro Max, XT ≠ XTX)
- Accessories (cases, cables, screen protectors)

---

## Running Tests

```bash
# All tests
pnpm test

# Unit tests only (matching engine, normalizer, fuzzy matcher)
pnpm test:unit

# Integration tests (requires running DB)
pnpm test:integration

# Watch mode during development
pnpm --dir apps/api exec jest --watch
```

---

## Production Deployment

### Build

```bash
pnpm build
```

### Docker Production

1. Copy and fill production env files:
```bash
cp apps/api/.env.example apps/api/.env.production
# Fill in production values — strong secrets, real DB URLs
```

2. Start the full stack:
```bash
docker compose -f docker-compose.prod.yml up -d
```

3. Run migrations on the production DB:
```bash
docker exec pricelens_api pnpm exec prisma migrate deploy
```

### Environment Checklist Before Production

- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are 64+ random bytes
- [ ] `POSTGRES_PASSWORD` and `REDIS_PASSWORD` are strong and unique
- [ ] `MEILI_MASTER_KEY` is 16+ random characters
- [ ] `NODE_ENV=production` is set on the API
- [ ] CORS `FRONTEND_URL` points to your real domain
- [ ] HTTPS is terminated at the load balancer / reverse proxy (Nginx/Caddy)
- [ ] Prisma migrations have been applied: `pnpm exec prisma migrate deploy`
- [ ] Search index is populated: `POST /api/v1/search/reindex` (admin)

---

## Folder Structure Summary

```
apps/web/src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Home — hero search + trending
│   ├── search/page.tsx     # Search results (URL-synced filters)
│   ├── products/[slug]/    # Product detail (SSR metadata + CSR tabs)
│   ├── watchlist/page.tsx  # User watchlist
│   ├── auth/               # Login + Register
│   └── admin/              # Dashboard + Review queue
├── components/
│   ├── ui/                 # Button, Badge, Card, Input, Skeleton, Toast
│   ├── layout/             # Navbar, Footer, Providers
│   ├── search/             # SearchBar (autocomplete), SearchFilters
│   ├── product/            # ProductCard, ProductList, ListingTable, PriceStatsBar
│   ├── charts/             # PriceChart (Recharts)
│   └── admin/              # DashboardStats, ReviewCard, ReviewQueue
├── lib/
│   ├── api/                # Axios client + service modules per domain
│   ├── hooks/              # React Query hooks (no server data in Zustand)
│   ├── store/              # Zustand (UI state only: filters, toasts, modals)
│   └── utils/              # cn, format, price utilities
├── types/                  # All TypeScript interfaces
└── config/                 # Query client, constants, query keys
```

---

## Known Limitations & Roadmap

| Item | Status | Notes |
|------|--------|-------|
| Image similarity matching | ⬜ Pending | Step 7 returns neutral 0.5. Requires perceptual hash service. |
| Email notifications for alerts | ⬜ Pending | Alert triggering works; email delivery not implemented. |
| Playwright scraper connectors | ⬜ Stub | Architecture complete; real connectors need platform-specific selectors. |
| OAuth (Google/GitHub) | ⬜ Pending | JWT auth is complete; social login needs strategy additions. |
| Currency conversion | ⬜ Partial | Prices normalized to USD; multi-currency display not implemented. |
| Mobile app | ⬜ Roadmap | API is mobile-ready. |

---

## License

MIT
