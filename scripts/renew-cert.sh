#!/usr/bin/env bash
# Renew the pricelens certificate and reload the proxy if anything changed.
#
# certbot exits 0 when the certificate is simply not due yet, so the reload is
# conditional on the files actually moving -- reloading nginx twice a day for
# three months would be noise, and on a two-core box shared with five ffmpeg
# processes, noise costs something.
set -euo pipefail

ROOT="$HOME/pricelens"
CONF="$ROOT/docker/certbot/conf"
LIVE="$CONF/live/pricelens.work.gd/fullchain.pem"

before=""
[[ -f "$LIVE" ]] && before="$(sha256sum "$LIVE" | cut -d' ' -f1)"

docker run --rm \
  -v "$CONF:/etc/letsencrypt:z" \
  -v "$ROOT/docker/certbot/www:/var/www/certbot:z" \
  docker.io/certbot/certbot:latest renew --webroot -w /var/www/certbot --quiet

after=""
[[ -f "$LIVE" ]] && after="$(sha256sum "$LIVE" | cut -d' ' -f1)"

if [[ "$before" != "$after" ]]; then
  echo "certificate renewed; reloading proxy"
  docker exec pricelens-proxy nginx -s reload
else
  echo "not due for renewal"
fi
