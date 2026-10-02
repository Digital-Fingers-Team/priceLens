#!/usr/bin/env bash
# Deploy the web app without dropping a request.
#
# The obvious sequence -- remove the old container, start the new one -- leaves
# nginx proxying to nothing for as long as Next.js takes to boot, so anyone
# mid-browse gets a 502. Instead the new container is started alongside the old
# one, polled until it actually serves a page, and only then does nginx switch
# to it. The old container is removed after the switch, so a failed boot costs
# nothing: the site keeps being served by the container that already works.
#
# Three things about this setup are not obvious and all have caused outages:
#
#  1. The live upstream is written to docker/nginx-upstreams/web.conf, which is
#     UNTRACKED and lives in a bind-mounted DIRECTORY. It used to be a literal
#     address inside the tracked nginx.prod.conf, which is bind-mounted as a
#     single FILE -- and that combination failed twice: a git operation on the
#     checkout reverted the address to a dead container, and replacing the file
#     by rename gave the host path a new inode while the container kept the old
#     one, so reloads silently re-read the old config. A directory mount has
#     neither problem. Writes still truncate in place, and the result is still
#     read back from inside the container before anything is reloaded.
#
#  2. Each colour publishes a FIXED loopback port (blue 127.0.0.1:3010, green
#     127.0.0.1:3011) and nginx proxies to that port. The proxy runs in the
#     host's network namespace (D-31, audit 10/11) so that it sees visitors'
#     real addresses; container names and container IPs are not reachable from
#     there. Before D-31 the upstream was the container's IP, because nginx on
#     this host once answered pricelens-web-* with 127.0.53.53; a fixed port
#     has neither that problem nor the "restarted on a new IP" one.
#
#  3. Server-side rendering calls the API directly over the podman network
#     (API_INTERNAL_URL). Without it every render went out to the public URL
#     and back in through the proxy, and all of them counted as one visitor
#     against the API's rate limit. WEB_INTERNAL_TOKEN (the same value the API
#     reads from .env) marks those calls as the website's own (OPS-14).
#
#   ./scripts/deploy-web.sh            # build from the working tree, then swap
#   ./scripts/deploy-web.sh --no-build # swap to the current :latest image
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NETWORK="pricelens_external"
PROXY="pricelens-proxy"
CONF="$ROOT/docker/nginx-upstreams/web.conf"
CONF_IN_PROXY="/etc/nginx/conf.d/upstreams/web.conf"
IMAGE="localhost/pricelens_web:latest"
API_INTERNAL_URL="http://api:3001/api/v1"
BOOT_TIMEOUT=180   # seconds to let Next.js come up before giving up

log()  { printf '\033[32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[31mfailed:\033[0m %s\n' "$*" >&2; exit 1; }

port_of() {
  case "$1" in
    pricelens-web-blue)  echo 3010 ;;
    pricelens-web-green) echo 3011 ;;
    *) return 1 ;;
  esac
}

upstream_line() {
  printf 'upstream pricelens_web { server 127.0.0.1:%s; } # %s\n' "$(port_of "$1")" "$1"
}

# NEXT_PUBLIC_* are compiled into the client bundle at build time, so they are
# build args, not runtime environment.
#
# Read key by key rather than sourcing: .env holds values that are valid to
# docker and not to a shell (RECONCILIATION_CRON=0 * * * * expands the stars
# against the working directory and then tries to run the first filename).
env_value() {
  sed -n "s/^$1=//p" .env | head -1
}

# The marker comment the switch leaves behind, e.g.
#     upstream pricelens_web { server 127.0.0.1:3010; } # pricelens-web-blue
# It tells the next deploy which container is live and therefore which colour
# to build into.
current_target() {
  [[ -f "$CONF" ]] || return 0
  sed -n 's|.*# \(pricelens-web-[a-z]*\).*|\1|p' "$CONF" | head -1
}

# Truncate-in-place, never rename -- see note 1 at the top.
write_conf() {
  local src="$1"
  mkdir -p "$(dirname "$CONF")"
  cat "$src" > "$CONF"
}

serves() {
  curl -s -o /dev/null -m 3 "http://127.0.0.1:$1/"
}

# The upstream file is untracked, so a fresh clone or a wiped checkout will not
# have it and nginx would refuse to start on an unknown upstream name. Create
# one pointing at whichever colour is serving.
ensure_conf() {
  [[ -f "$CONF" ]] && return 0
  warn "$CONF is missing; recreating it"
  local existing
  for existing in pricelens-web-green pricelens-web-blue; do
    if serves "$(port_of "$existing")"; then
      mkdir -p "$(dirname "$CONF")"
      upstream_line "$existing" > "$CONF"
      return 0
    fi
  done
  die "no web container is serving and $CONF is missing -- nothing to point nginx at"
}

API_URL="$(env_value NEXT_PUBLIC_API_URL)"
SITE_URL="$(env_value NEXT_PUBLIC_SITE_URL)"
[[ -n "$API_URL" && -n "$SITE_URL" ]] || die "NEXT_PUBLIC_API_URL and NEXT_PUBLIC_SITE_URL must be set in .env"

podman container exists "$PROXY" || die "$PROXY is not running; start the stack first"

ensure_conf

if [[ "${1:-}" != "--no-build" ]]; then
  log "building image"
  docker build -f docker/Dockerfile.web \
    --build-arg "NEXT_PUBLIC_API_URL=$API_URL" \
    --build-arg "NEXT_PUBLIC_SITE_URL=$SITE_URL" \
    -t "$IMAGE" . || die "build failed -- nothing was swapped, the site is untouched"
fi

active="$(current_target || true)"
case "$active" in
  pricelens-web-blue)  idle="pricelens-web-green" ;;
  pricelens-web-green) idle="pricelens-web-blue"  ;;
  *) die "$CONF names no live colour (# pricelens-web-blue|green); fix it before deploying" ;;
esac
idle_port="$(port_of "$idle")"
log "active: $active  ->  starting: $idle (127.0.0.1:$idle_port)"

podman rm -f "$idle" >/dev/null 2>&1 || true

podman run -d --name "$idle" \
  --network "$NETWORK" --network-alias "$idle" \
  -p "127.0.0.1:$idle_port:3000" \
  --restart always \
  -e "NEXT_PUBLIC_API_URL=$API_URL" \
  -e "API_INTERNAL_URL=$API_INTERNAL_URL" \
  -e "WEB_INTERNAL_TOKEN=$(env_value WEB_INTERNAL_TOKEN)" \
  "$IMAGE" >/dev/null || die "could not start $idle"

log "waiting for $idle to serve on 127.0.0.1:$idle_port"
ready=0
for _ in $(seq 1 $((BOOT_TIMEOUT / 3))); do
  if serves "$idle_port"; then
    ready=1; break
  fi
  sleep 3
done

if [[ "$ready" != 1 ]]; then
  podman logs --tail 30 "$idle" 2>&1 | sed 's/^/    /' || true
  podman rm -f "$idle" >/dev/null 2>&1 || true
  die "$idle never served a page; left $active serving"
fi

log "pointing nginx at 127.0.0.1:$idle_port"
tmp="$(mktemp)"; trap 'rm -f "$tmp" "$tmp.prev"' EXIT
cp "$CONF" "$tmp.prev"

# The whole file is one upstream block, so it is rewritten rather than patched.
upstream_line "$idle" > "$tmp"
write_conf "$tmp"

# Read it back from inside the container: if the bind mount has come adrift
# (note 1), nginx is about to reload a config nobody edited, and the deploy
# would report success while serving the old container -- or nothing at all.
if ! docker exec "$PROXY" grep -q "# $idle" "$CONF_IN_PROXY" 2>/dev/null; then
  write_conf "$tmp.prev"
  podman rm -f "$idle" >/dev/null 2>&1 || true
  die "the proxy cannot see edits to $CONF (stale bind mount).
     Recreate it once -- docker compose -f docker-compose.server.yml up -d --force-recreate proxy --
     then run this again. $active is still serving."
fi

if ! docker exec "$PROXY" nginx -t >/dev/null 2>&1; then
  write_conf "$tmp.prev"
  docker exec "$PROXY" nginx -s reload >/dev/null 2>&1 || true
  podman rm -f "$idle" >/dev/null 2>&1 || true
  die "nginx rejected the new config; rolled back, nothing changed"
fi

# reload, not restart: in-flight requests finish on the old worker.
docker exec "$PROXY" nginx -s reload

# Confirm the site actually serves through the new upstream before the old one
# is taken away. If it does not, put the previous config back -- the old
# container is still running, so this is a real rollback, not a hope.
sleep 2
served=0
for _ in $(seq 1 10); do
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 5 \
    --resolve "pricelens.store:443:127.0.0.1" https://pricelens.store/ || true)"
  if [[ "$code" == "200" ]]; then served=1; break; fi
  sleep 2
done

if [[ "$served" != 1 ]]; then
  # Only roll back if there is something alive to roll back TO. Restoring a
  # config that names a removed container points nginx at nothing and turns a
  # failed deploy into an outage -- which is precisely what happened once.
  if serves "$(port_of "$active")"; then
    warn "site did not answer 200 through $idle; rolling back"
    write_conf "$tmp.prev"
    docker exec "$PROXY" nginx -s reload || true
    podman rm -f "$idle" >/dev/null 2>&1 || true
    die "rolled back to $active"
  fi

  # Nothing alive to fall back to: keep the new container serving and say so.
  # A half-working site beats a config pointing at a container that is gone.
  die "site did not answer 200 through $idle, and $active is no longer
     serving -- so the config was NOT rolled back. $idle is still serving on
     127.0.0.1:$idle_port. Check: podman logs --tail 50 $idle"
fi

# Only now is the old container unnecessary. The pause lets requests that were
# already on it finish.
sleep 3
log "removing $active"
podman rm -f "$active" >/dev/null 2>&1 || true

log "live on $idle (127.0.0.1:$idle_port)"
