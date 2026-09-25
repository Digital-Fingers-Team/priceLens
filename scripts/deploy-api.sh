#!/usr/bin/env bash
# Deploy the API.
#
# Two things about this stack have each caused an outage and are why this
# script exists rather than a bare compose command:
#
#  1. `docker compose up -d --force-recreate api` does NOT stop at the api.
#     The proxy declares depends_on the api, so compose tears the proxy down
#     too -- and if it fails to bring it back, the whole site is gone, not
#     just the API. `--no-deps` is mandatory here, and the proxy is brought
#     back explicitly in the same breath.
#
#  2. nginx resolves the `api` upstream hostname ONCE, when the config loads.
#     A recreated container gets a new address on the compose network, so the
#     proxy keeps sending requests to an address nothing is listening on and
#     every API call 502s -- while the API itself is healthy and the logs look
#     fine. The reload after the swap is not optional.
#
# Unlike deploy-web.sh this cannot be zero-downtime: the api container owns a
# fixed host port and a fixed network alias, so the replacement cannot run
# alongside the old one. Expect ~20-30s. The window is kept small by building
# and testing the image BEFORE anything is torn down.
#
#   ./scripts/deploy-api.sh              # build from the working tree, then swap
#   ./scripts/deploy-api.sh --no-build   # swap to the current :latest image
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE="docker-compose.server.yml"
PROXY="pricelens-proxy"
API="pricelens-api"
IMAGE="localhost/pricelens_api:latest"
ROLLBACK="localhost/pricelens_api:rollback"
HEALTH_TIMEOUT=180

log()  { printf '\033[32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[31mfailed:\033[0m %s\n' "$*" >&2; exit 1; }

podman container exists "$PROXY" || die "$PROXY is not running; start the stack first"

if [[ "${1:-}" != "--no-build" ]]; then
  log "building $IMAGE"
  # Build to a staging tag so a failed build cannot leave :latest pointing at
  # a half-made image that the next deploy would happily roll out.
  podman build -f docker/Dockerfile.api -t localhost/pricelens_api:staging . \
    || die "build failed -- nothing was swapped, the API is untouched"

  log "running unit tests against the built image"
  # NODE_ENV=test and a *_test database name are required: the Jest global
  # setup refuses to run under NODE_ENV=production (the image default) or
  # against any database not named *_test. Unit tests never connect to it.
  podman run --rm --entrypoint sh -w /repo/apps/api localhost/pricelens_api:staging \
    -lc 'NODE_ENV=test DATABASE_URL=postgresql://unused:unused@127.0.0.1:5432/unused_test ./node_modules/.bin/jest --testPathPattern=test/unit --runInBand' \
    >/dev/null 2>&1 || die "unit tests failed in the built image -- refusing to deploy"

  # Keep the image currently deployed so a bad release can be put back.
  podman tag "$IMAGE" "$ROLLBACK" 2>/dev/null || true
  podman tag localhost/pricelens_api:staging "$IMAGE"
fi

# Migrations run from the NEW image before the old container is removed. If a
# migration fails the current API keeps serving, rather than the replacement
# refusing to boot after the old one is already gone.
log "applying database migrations"
podman run --rm --network pricelens_internal --env-file .env \
  --entrypoint sh -w /repo/apps/api "$IMAGE" \
  -lc 'node /repo/node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/build/index.js migrate deploy' \
  || die "migration failed -- the running API is untouched"

started=$(date +%s)

# --depend because the proxy depends on the api and podman refuses otherwise.
# This is the moment the site's API goes down; everything slow already ran.
log "replacing $API"
podman rm -f --depend "$API" >/dev/null 2>&1 || true

docker compose -f "$COMPOSE" up -d --no-deps api proxy >/dev/null 2>&1 \
  || die "could not start the api/proxy -- check 'podman ps -a'"

log "waiting for the API to report healthy"
healthy=0
for _ in $(seq 1 $((HEALTH_TIMEOUT / 3))); do
  if podman ps --filter "name=$API" --format '{{.Status}}' | grep -q healthy; then
    healthy=1; break
  fi
  sleep 3
done

if [[ "$healthy" != 1 ]]; then
  podman logs --tail 40 "$API" 2>&1 | sed 's/^/    /' || true
  die "the API never became healthy. Roll back with:
     podman tag $ROLLBACK $IMAGE && ./scripts/deploy-api.sh --no-build"
fi

# See note 2: without this the proxy still holds the removed container's address.
log "reloading nginx so it re-resolves the api upstream"
docker exec "$PROXY" nginx -s reload >/dev/null 2>&1 || warn "nginx reload reported an error"

# Confirm through the public URL, not just the container health check -- the
# health check passes even when the proxy is pointed at a stale address.
sleep 2
served=0
for _ in $(seq 1 10); do
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 5 \
    --resolve "pricelens.work.gd:443:127.0.0.1" \
    https://pricelens.work.gd/api/v1/billing/plans || true)"
  if [[ "$code" == "200" ]]; then served=1; break; fi
  sleep 2
done

[[ "$served" == 1 ]] || die "the API is healthy but not reachable through the proxy.
     Try: docker exec $PROXY nginx -s reload
     Roll back with: podman tag $ROLLBACK $IMAGE && ./scripts/deploy-api.sh --no-build"

log "live ($(( $(date +%s) - started ))s of API downtime)"
