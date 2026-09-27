#!/usr/bin/env bash
# Keep docker/nginx-upstreams/web.conf pointed at the live web container.
#
# Since D-31 each web colour publishes a fixed loopback port (deploy-web.sh
# note 2), and the upstream is that port: a restarted container comes back on
# the same port, so there is nothing to follow and this exits.
#
# It still handles the old form (a container IP on the podman network, which
# changes when the container restarts): it re-points the file at the named
# container's current IP and reloads nginx only when the IP has changed. It
# never changes WHICH container is live, so it cannot fight a deploy.
#
# Run by pricelens-web-upstream.timer (at boot, then every minute).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NETWORK="pricelens_external"
PROXY="pricelens-proxy"
CONF="$ROOT/docker/nginx-upstreams/web.conf"
CONF_IN_PROXY="/etc/nginx/conf.d/upstreams/web.conf"

[[ -f "$CONF" ]] || exit 0
# Fixed loopback port: nothing to follow.
grep -q 'server 127\.0\.0\.1:' "$CONF" && exit 0

name="$(sed -n 's|.*# \(pricelens-web[a-z-]*\).*|\1|p' "$CONF" | head -1)"
[[ -n "$name" ]] || { echo "no container marker in $CONF; leaving it alone"; exit 0; }

running() { [[ "$(podman inspect "$1" --format '{{.State.Running}}' 2>/dev/null)" == true ]]; }
running "$name" && running "$PROXY" || exit 0

ip="$(podman inspect "$name" --format "{{.NetworkSettings.Networks.${NETWORK}.IPAddress}}")"
[[ -n "$ip" ]] || exit 0
current="$(sed -n 's|.*server \([0-9.]*\):3000.*|\1|p' "$CONF" | head -1)"
# No IP:3000 form to compare with: an unknown layout, not something to rewrite.
[[ -n "$current" ]] || exit 0
[[ "$ip" == "$current" ]] && exit 0

echo "$name moved $current -> $ip; updating $CONF"
prev="$(cat "$CONF")"
# Truncate in place, never rename -- see deploy-web.sh note 1.
printf 'upstream pricelens_web { server %s:3000; } # %s\n' "$ip" "$name" > "$CONF"

if ! podman exec "$PROXY" grep -q "server $ip:3000" "$CONF_IN_PROXY" \
   || ! podman exec "$PROXY" nginx -t >/dev/null 2>&1; then
  printf '%s\n' "$prev" > "$CONF"
  echo "proxy cannot see the edit or rejected it; restored previous file" >&2
  exit 1
fi
podman exec "$PROXY" nginx -s reload
