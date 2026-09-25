#!/usr/bin/env bash
# Renew every certificate this proxy serves and reload it if anything changed.
#
# certbot exits 0 when nothing is due yet, so the reload is conditional on the
# files actually moving -- reloading nginx twice a day for three months would be
# noise, and on a two-core box shared with five ffmpeg processes, noise costs
# something.
#
# The check used to look at the pricelens certificate alone. That was correct
# while it was the only one; it is not correct now that team.publicvm.com and
# quran.run.place have their own. A renewal of either would have left nginx
# holding the expired file in memory until something else reloaded it -- which,
# for a 24/7 stream nobody restarts, could be a long time after the browser
# started refusing to connect. Hashing every live certificate keeps the reload
# tied to the question actually being asked: did any of them change?
set -euo pipefail

ROOT="$HOME/pricelens"
CONF="$ROOT/docker/certbot/conf"

fingerprint() {
  # Sorted so the digest depends on the contents, not on readdir order, and
  # tolerant of the directory not existing yet on a first run.
  find "$CONF/live" -name fullchain.pem -type f 2>/dev/null \
    | sort | xargs -r sha256sum | sha256sum | cut -d' ' -f1
}

before="$(fingerprint)"

docker run --rm \
  -v "$CONF:/etc/letsencrypt:z" \
  -v "$ROOT/docker/certbot/www:/var/www/certbot:z" \
  docker.io/certbot/certbot:latest renew --webroot -w /var/www/certbot --quiet

after="$(fingerprint)"

if [[ "$before" != "$after" ]]; then
  echo "certificate(s) renewed; reloading proxy"
  docker exec pricelens-proxy nginx -s reload
else
  echo "not due for renewal"
fi
