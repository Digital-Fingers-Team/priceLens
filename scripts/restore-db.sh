#!/usr/bin/env bash
# Restore a backup-db.sh dump into a NEW database (docs/RUNBOOK.md).
#
#   scripts/restore-db.sh <file.dump> <target_db>
#
# Always restores into a database that does not exist yet, so the live one is
# never touched: check the copy, then switch DATABASE_URL to it (or rename
# databases) as a separate, deliberate step. Prints row counts of the core
# tables when done.
#
# Environment: PG_CONTAINER (default pricelens-postgres).
set -euo pipefail

file="${1:?usage: restore-db.sh <file.dump> <target_db>}"
target="${2:?usage: restore-db.sh <file.dump> <target_db>}"
PG_CONTAINER="${PG_CONTAINER:-pricelens-postgres}"

[[ -f "$file" ]] || { echo "no such file: $file" >&2; exit 1; }
[[ "$target" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "target must be a plain lowercase database name" >&2; exit 1; }

psql_in() { podman exec -i "$PG_CONTAINER" sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"$1\" -Atq"; }

exists="$(echo "SELECT 1 FROM pg_database WHERE datname = '$target'" | psql_in postgres)"
[[ -z "$exists" ]] || { echo "database $target already exists; pick a new name (this script never overwrites)" >&2; exit 1; }

echo "CREATE DATABASE $target" | psql_in postgres
# Extensions first: the dump references vector/pg_trgm types and indexes.
printf '%s\n' 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";' 'CREATE EXTENSION IF NOT EXISTS vector;' \
  'CREATE EXTENSION IF NOT EXISTS pg_trgm;' 'CREATE EXTENSION IF NOT EXISTS btree_gin;' | psql_in "$target"
podman exec -i "$PG_CONTAINER" sh -c "pg_restore -U \"\$POSTGRES_USER\" -d \"$target\" --no-owner --exit-on-error" < "$file"

echo "restored into $target:"
for table in canonical_products source_listings price_history users _prisma_migrations; do
  echo "  $table $(echo "SELECT count(*) FROM $table" | psql_in "$target")"
done
