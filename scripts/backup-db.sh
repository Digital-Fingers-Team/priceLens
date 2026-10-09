#!/usr/bin/env bash
# Nightly Postgres backup for PriceLens (CLAUDE.md, "Runbook").
#
# pg_dump in custom format (compressed, restorable table by table) taken
# inside the database container, so no database port or password leaves it.
# Files land in $BACKUP_DIR as pricelens-YYYYmmddTHHMMSSZ.dump, written to a
# temporary name first so a half-written dump is never mistaken for a backup.
#
# Retention: every dump from the last KEEP_DAYS days, plus the newest dump of
# each of the last KEEP_WEEKS weeks.
#
# The dump is checked before it counts: pg_restore --list must read it, and it
# must contain the core tables. A failed check exits non-zero (the timer's
# unit then shows "failed", which the uptime check reports).
#
# Run by pricelens-db-backup.timer (daily 03:15 UTC); see scripts/systemd/.
# Environment (defaults are production):
#   PG_CONTAINER=pricelens-postgres  BACKUP_DIR=~/pricelens/backups/db
#   KEEP_DAYS=7  KEEP_WEEKS=4
set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-pricelens-postgres}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/pricelens/backups/db}"
KEEP_DAYS="${KEEP_DAYS:-7}"
KEEP_WEEKS="${KEEP_WEEKS:-4}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final="$BACKUP_DIR/pricelens-$stamp.dump"
partial="$final.partial"
trap 'rm -f "$partial"' EXIT

# The container's own POSTGRES_USER / POSTGRES_DB, so this script never needs
# the credentials.
podman exec "$PG_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner' > "$partial"

listing="$(podman exec -i "$PG_CONTAINER" pg_restore --list < "$partial")"
for table in canonical_products source_listings price_history users; do
  grep -q "TABLE DATA public $table " <<<"$listing" || { echo "backup check failed: no data for $table" >&2; exit 1; }
done
chmod 600 "$partial"
mv "$partial" "$final"
echo "backup ok: $final ($(du -h "$final" | cut -f1))"

# Retention. Names sort by time, so the newest file of a week is the last one.
now="$(date -u +%s)"
declare -A newest_of_week=()
for file in "$BACKUP_DIR"/pricelens-*.dump; do
  ts="$(basename "$file" .dump)"; ts="${ts#pricelens-}"
  week="$(date -u -d "${ts:0:8}" +%G-%V)"
  newest_of_week[$week]="$file"
done
mapfile -t keep_weeks < <(printf '%s\n' "${!newest_of_week[@]}" | sort -r | head -n "$KEEP_WEEKS")
for file in "$BACKUP_DIR"/pricelens-*.dump; do
  ts="$(basename "$file" .dump)"; ts="${ts#pricelens-}"
  age_days=$(( (now - $(date -u -d "${ts:0:8}" +%s)) / 86400 ))
  (( age_days < KEEP_DAYS )) && continue
  week="$(date -u -d "${ts:0:8}" +%G-%V)"
  if [[ " ${keep_weeks[*]} " == *" $week "* && "${newest_of_week[$week]}" == "$file" ]]; then continue; fi
  rm -f "$file" && echo "pruned $(basename "$file")"
done
