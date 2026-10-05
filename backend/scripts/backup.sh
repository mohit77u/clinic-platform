#!/usr/bin/env bash
# Daily PostgreSQL backup (custom format, compressed). Keeps the newest $KEEP dumps.
# Cron example:  15 2 * * *  cd /srv/clinic-platform/backend && ./scripts/backup.sh >> /var/log/clinic-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
: "${DB_HOST:?}" "${DB_USERNAME:?}" "${DB_PASSWORD:?}" "${DB_NAME:?}"
OUT_DIR="${BACKUP_DIR:-./backups}"
KEEP="${BACKUP_KEEP:-14}"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/${DB_NAME}_$(date +%Y%m%d_%H%M%S).dump"
PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "${DB_PORT:-5432}" -U "$DB_USERNAME" -Fc -f "$FILE" "$DB_NAME"
# a dump that cannot be listed is not a backup
pg_restore -l "$FILE" > /dev/null
echo "backup ok: $FILE ($(du -h "$FILE" | cut -f1))"
ls -1t "$OUT_DIR"/${DB_NAME}_*.dump | tail -n +$((KEEP + 1)) | xargs -r rm -f
# Off-site copy (recommended): rclone/rsync "$FILE" to object storage here.
