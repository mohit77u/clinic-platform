#!/usr/bin/env bash
# Restore drill: restores the newest dump into a scratch database and compares row counts with the live DB.
# Run it monthly (and after any change to backups). Exits non-zero if anything differs.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
OUT_DIR="${BACKUP_DIR:-./backups}"
SCRATCH="${DB_NAME}_restore_drill"
LATEST="$(ls -1t "$OUT_DIR"/${DB_NAME}_*.dump | head -n1)"
export PGPASSWORD="$DB_PASSWORD"
PSQL=(psql -h "$DB_HOST" -p "${DB_PORT:-5432}" -U "$DB_USERNAME" -v ON_ERROR_STOP=1 -At)
echo "restoring $LATEST into $SCRATCH"
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS \"$SCRATCH\"" -c "CREATE DATABASE \"$SCRATCH\""
pg_restore -h "$DB_HOST" -p "${DB_PORT:-5432}" -U "$DB_USERNAME" -d "$SCRATCH" --no-owner "$LATEST"
count() { "${PSQL[@]}" -d "$1" -c "SELECT string_agg(relname || '=' || n, ',' ORDER BY relname) FROM (
  SELECT c.relname, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I', c.relname), false, true, '')))[1]::text AS n
  FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname = 'public' AND c.relkind = 'r') t"; }
LIVE="$(count "$DB_NAME")"; RESTORED="$(count "$SCRATCH")"
"${PSQL[@]}" -d postgres -c "DROP DATABASE \"$SCRATCH\""
if [ "$LIVE" = "$RESTORED" ]; then echo "RESTORE DRILL OK"; else echo "MISMATCH"; echo "live:     $LIVE"; echo "restored: $RESTORED"; exit 1; fi
