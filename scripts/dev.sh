#!/usr/bin/env bash
# One command for local development: `pnpm dev:up`
#
#   1. start Postgres/Redis/Meilisearch (docker-compose.yml, project pricelens-dev)
#   2. wait until they are healthy
#   3. apply migrations to the dev and test databases
#   4. seed the demo catalog if the dev database has no products yet
#   5. run the API (watch mode) and the web app (next dev) until Ctrl-C
#
# Environment: ENV_FILE (default .env.development), API_PORT (3001),
# WEB_PORT (3000), SKIP_SEED=1 to never seed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export ENV_FILE="${ENV_FILE:-$ROOT/.env.development}"
API_PORT="${API_PORT:-3001}"
WEB_PORT="${WEB_PORT:-3000}"
COMPOSE=(docker compose -p pricelens-dev -f "$ROOT/docker-compose.yml")

log() { printf '\033[1;32m[dev]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[dev]\033[0m %s\n' "$*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || die "ENV_FILE $ENV_FILE does not exist."
command -v docker >/dev/null || die "docker (or podman with its docker shim) is required."
[ -d "$ROOT/node_modules" ] || die "Dependencies missing: run \`pnpm install\` first."

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
port_busy "$API_PORT" && die "Port $API_PORT is in use. Set API_PORT to a free port."
port_busy "$WEB_PORT" && die "Port $WEB_PORT is in use. Set WEB_PORT to a free port."

log "Starting infrastructure (project pricelens-dev)..."
"${COMPOSE[@]}" up -d >/dev/null

log "Waiting for services to become healthy..."
for _ in $(seq 1 60); do
  if docker exec pricelens-dev-postgres pg_isready -U pricelens -d pricelens_dev >/dev/null 2>&1 &&
     docker exec pricelens-dev-redis redis-cli -a pricelens_redis_dev --no-auth-warning ping 2>/dev/null | grep -q PONG &&
     curl -fs http://127.0.0.1:7700/health >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
[ "${ready:-}" = 1 ] || die "Infrastructure did not become healthy within 2 minutes."

log "Applying migrations (dev and test databases)..."
pnpm exec dotenv -e "$ENV_FILE" -- pnpm --dir apps/api exec prisma migrate deploy >/dev/null
pnpm exec dotenv -e "$ROOT/.env.test" -- pnpm --dir apps/api exec prisma migrate deploy >/dev/null

products="$(docker exec pricelens-dev-postgres psql -U pricelens -d pricelens_dev -Atc 'select count(*) from canonical_products')"
if [ "$products" = 0 ] && [ "${SKIP_SEED:-}" != 1 ]; then
  log "Empty dev database: seeding the demo catalog (240 products)..."
  SEED_GENERATE_PRODUCTS=true SEED_PROFILE=demo \
    pnpm exec dotenv -e "$ENV_FILE" -- pnpm --dir apps/api exec ts-node prisma/seed.ts >/dev/null
fi

log "API  http://localhost:$API_PORT/api/v1   (docs: /docs)"
log "Web  http://localhost:$WEB_PORT"

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; wait 2>/dev/null || true; }
trap cleanup EXIT INT TERM

PORT="$API_PORT" FRONTEND_URL="http://localhost:$WEB_PORT" \
  pnpm --filter @pricelens/api exec nest start --watch &
pids+=($!)

NEXT_PUBLIC_API_URL="http://localhost:$API_PORT/api/v1" \
API_INTERNAL_URL="http://127.0.0.1:$API_PORT/api/v1" \
NEXT_PUBLIC_SITE_URL="http://localhost:$WEB_PORT" \
  pnpm --filter @pricelens/web exec next dev -p "$WEB_PORT" &
pids+=($!)

wait -n "${pids[@]}"
