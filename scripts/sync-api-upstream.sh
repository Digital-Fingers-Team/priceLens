#!/usr/bin/env bash
# Reload pricelens-proxy when the API container comes back on a new address.
#
# nginx.prod.conf proxies /api/ to the name "api", and nginx resolves a name
# once, when the config is loaded. When the API container is restarted by its
# restart policy (an out-of-memory crash, a reboot), podman gives it a new IP
# and nginx keeps sending /api/ to the old one: every API call answers 502
# until someone reloads the proxy (7.5 minutes on 2026-09-27). A reload makes
# nginx look the name up again, so that is all this does -- and only when the
# container's address differs from the one recorded at the last reload.
#
# The first run records the address and reloads once, because it cannot know
# which address nginx resolved before it started watching. A reload is
# graceful: open connections finish on the old workers.
#
# Run by pricelens-api-upstream.timer (at boot, then every 20 seconds); see
# scripts/systemd/.
set -euo pipefail

NETWORK="${UPSTREAM_NETWORK:-pricelens_external}"
PROXY="${PROXY_CONTAINER:-pricelens-proxy}"
API="${API_CONTAINER:-pricelens-api}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/pricelens"
STATE="$STATE_DIR/api-upstream-ip"

running() { [[ "$(podman inspect "$1" --format '{{.State.Running}}' 2>/dev/null)" == true ]]; }
running "$API" && running "$PROXY" || exit 0

ip="$(podman inspect "$API" --format "{{.NetworkSettings.Networks.${NETWORK}.IPAddress}}")"
[[ -n "$ip" ]] || exit 0
mkdir -p "$STATE_DIR"
last="$(cat "$STATE" 2>/dev/null || true)"
[[ "$ip" == "$last" ]] && exit 0

echo "$API is at $ip (last reload saw ${last:-nothing}); reloading $PROXY"
podman exec "$PROXY" nginx -t >/dev/null 2>&1 || { echo "nginx -t failed; not reloading" >&2; exit 1; }
podman exec "$PROXY" nginx -s reload
printf '%s\n' "$ip" > "$STATE"
