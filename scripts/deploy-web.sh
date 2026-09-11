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
# Two things about this setup are not obvious and both have caused outages:
#
#  1. nginx.prod.conf is bind-mounted into the proxy as a single FILE. Anything
#     that replaces it by rename -- sed -i, mv, most editors -- gives the host
#     path a new inode while the container keeps the old one, so the edit is
#     invisible to nginx and the reload silently re-reads the old config. Every
#     write here truncates in place instead, and the result is read back from
#     inside the container before anything is reloaded.
#
#  2. nginx resolves an upstream hostname once, when the config is loaded, and
#     on this host it has answered pricelens-web-* with 127.0.53.53 even while
#     the same lookup from inside the same container succeeded. So the switch
#     writes the container's IP address and keeps the name only in a comment,
#     which is also how the active container is identified on the next run.
#
#   ./scripts/deploy-web.sh            # build from the working tree, then swap
#   ./scripts/deploy-web.sh --no-build # swap to the current :latest image
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NETWORK="pricelens_external"
PROXY="pricelens-proxy"
CONF="$ROOT/docker/nginx.prod.conf"
CONF_IN_PROXY="/etc/nginx/conf.d/default.conf"
IMAGE="localhost/pricelens_web:latest"
BOOT_TIMEOUT=180   # seconds to let Next.js come up before giving up

log()  { printf '\033[32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[31mfailed:\033[0m %s\n' "$*" >&2; exit 1; }

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
#     proxy_pass http://10.89.1.60:3000; # web -> pricelens-web-blue
# The IP is what nginx uses; this name is what tells the next deploy which
# container is live and therefore which colour to build into.
current_target() {
  sed -n 's|.*# web -> \(pricelens-web-[a-z]*\).*|\1|p' "$CONF" | head -1
}

container_ip() {
  podman inspect "$1" --format "{{.NetworkSettings.Networks.${NETWORK}.IPAddress}}" 2>/dev/null
}

# Truncate-in-place, never rename -- see note 1 at the top.
write_conf() {
  local src="$1"
  cat "$src" > "$CONF"
}

API_URL="$(env_value NEXT_PUBLIC_API_URL)"
SITE_URL="$(env_value NEXT_PUBLIC_SITE_URL)"
[[ -n "$API_URL" && -n "$SITE_URL" ]] || die "NEXT_PUBLIC_API_URL and NEXT_PUBLIC_SITE_URL must be set in .env"

podman container exists "$PROXY" || die "$PROXY is not running; start the stack first"

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
  *) active=""; idle="pricelens-web-blue" ;;   # first run, or still on compose
esac
log "active: ${active:-<none>}  ->  starting: $idle"

# If the config carries no marker but the colour we are about to build into is
# the one nginx is actually pointed at, removing it would take the site down --
# which is the whole thing this script exists to prevent. Refuse instead.
if [[ -z "$active" ]] && podman container exists "$idle"; then
  live_ip="$(sed -n 's|.*proxy_pass http://\([0-9.]*\):3000;.*|\1|p' "$CONF" | head -1)"
  if [[ -n "$live_ip" && "$live_ip" == "$(container_ip "$idle")" ]]; then
    die "$idle is the container nginx is currently serving, and the config has
     no '# web -> <colour>' marker saying so. Append one to the web upstream
     line in $CONF (truncating in place, not with sed -i), then run again."
  fi
fi

podman rm -f "$idle" >/dev/null 2>&1 || true

podman run -d --name "$idle" \
  --network "$NETWORK" --network-alias "$idle" \
  --restart always \
  -e "NEXT_PUBLIC_API_URL=$API_URL" \
  "$IMAGE" >/dev/null || die "could not start $idle"

idle_ip="$(container_ip "$idle")"
[[ -n "$idle_ip" ]] || { podman rm -f "$idle" >/dev/null 2>&1 || true; die "$idle has no address on $NETWORK"; }

log "waiting for $idle ($idle_ip) to serve"
ready=0
for _ in $(seq 1 $((BOOT_TIMEOUT / 3))); do
  # Asked from inside the proxy, by the address nginx will actually use -- so a
  # pass here means the switch will work, not merely that a process started.
  if docker exec "$PROXY" wget -q -T 3 -O /dev/null "http://$idle_ip:3000/" 2>/dev/null; then
    ready=1; break
  fi
  sleep 3
done

if [[ "$ready" != 1 ]]; then
  podman logs --tail 30 "$idle" 2>&1 | sed 's/^/    /' || true
  podman rm -f "$idle" >/dev/null 2>&1 || true
  die "$idle never served a page; left ${active:-the running container} serving"
fi

log "pointing nginx at $idle_ip"
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
cp "$CONF" "$tmp.prev"

# Replace whatever the web upstream currently is -- a name from the original
# compose config, or an address from a previous deploy -- and stamp the colour.
# "@" as the delimiter, not "|": the pattern needs "|" for the alternation.
sed -E "s@proxy_pass http://(web|pricelens-web-[a-z]+|[0-9.]+):3000;.*@proxy_pass http://$idle_ip:3000; # web -> $idle@" \
  "$CONF" > "$tmp"

grep -q "# web -> $idle" "$tmp" || { rm -f "$tmp.prev"; podman rm -f "$idle" >/dev/null 2>&1 || true; die "could not find the web upstream in $CONF"; }

write_conf "$tmp"

# Read it back from inside the container: if the bind mount has come adrift
# (note 1), nginx is about to reload a config nobody edited, and the deploy
# would report success while serving the old container -- or nothing at all.
if ! docker exec "$PROXY" grep -q "# web -> $idle" "$CONF_IN_PROXY" 2>/dev/null; then
  write_conf "$tmp.prev"; rm -f "$tmp.prev"
  podman rm -f "$idle" >/dev/null 2>&1 || true
  die "the proxy cannot see edits to $CONF (stale bind mount).
     Recreate it once -- docker compose -f docker-compose.server.yml up -d --force-recreate proxy --
     then run this again. ${active:-The running container} is still serving."
fi

if ! docker exec "$PROXY" nginx -t >/dev/null 2>&1; then
  write_conf "$tmp.prev"; rm -f "$tmp.prev"
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
    --resolve "pricelens.work.gd:443:127.0.0.1" https://pricelens.work.gd/ || true)"
  if [[ "$code" == "200" ]]; then served=1; break; fi
  sleep 2
done

if [[ "$served" != 1 ]]; then
  warn "site did not answer 200 through $idle; rolling back"
  write_conf "$tmp.prev"
  docker exec "$PROXY" nginx -s reload || true
  rm -f "$tmp.prev"
  podman rm -f "$idle" >/dev/null 2>&1 || true
  die "rolled back to ${active:-the previous upstream}"
fi
rm -f "$tmp.prev"

# Only now is the old container unnecessary. The pause lets requests that were
# already on it finish.
sleep 3
if [[ -n "$active" ]]; then
  log "removing $active"
  podman rm -f "$active" >/dev/null 2>&1 || true
fi
# The compose-managed container, if this is the first blue/green deploy. It is
# stopped rather than removed: podman refuses to remove it while the proxy
# declares a dependency on it, and removing that dependency means removing the
# proxy -- the exact outage this script exists to avoid.
podman stop pricelens-web >/dev/null 2>&1 || true

log "live on $idle ($idle_ip)"
