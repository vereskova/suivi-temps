#!/usr/bin/env bash
# Weekly backup of the VLADIS Supabase project onto this Synology NAS:
#   - a full Postgres dump (schema + data)
#   - a mirror of the Storage bucket (dossier-salarie documents)
# Runs entirely via Docker (Container Manager) so nothing needs to be
# installed on the NAS itself beyond that package.
#
# Setup (once):
#   1. Package Center -> install "Container Manager" if not already present.
#   2. Copy vladis-backup.env.example to vladis-backup.env next to this
#      script, fill in the real values, then: chmod 600 vladis-backup.env
#   3. Control Panel -> Task Scheduler -> Create -> Scheduled Task ->
#      User-defined script. Schedule: weekly. Run command:
#        bash /volume1/scripts/nas-backup/vladis-backup.sh
#
# Safe to re-run: each run writes its own dated folder and never touches
# a previous one.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/vladis-backup.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy vladis-backup.env.example there and fill it in first." >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

for var in SUPABASE_DB_URL SUPABASE_S3_ENDPOINT SUPABASE_S3_REGION \
           SUPABASE_S3_ACCESS_KEY_ID SUPABASE_S3_SECRET_ACCESS_KEY \
           SUPABASE_S3_BUCKET BACKUP_ROOT RETENTION_WEEKS; do
  if [[ -z "${!var:-}" ]]; then
    echo "Missing $var in $ENV_FILE" >&2
    exit 1
  fi
done

DATE="$(date +%Y-%m-%d)"
DEST="$BACKUP_ROOT/$DATE"
mkdir -p "$DEST/storage"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "Starting backup into $DEST"

# ── Database dump ──────────────────────────────────────────────────────
log "Dumping Postgres..."
docker run --rm postgres:16-alpine \
  pg_dump --no-owner --no-privileges "$SUPABASE_DB_URL" \
  | gzip > "$DEST/vladis_db_$DATE.sql.gz"
log "Database dump done: $(du -h "$DEST/vladis_db_$DATE.sql.gz" | cut -f1)"

# ── Storage bucket mirror ───────────────────────────────────────────────
log "Syncing Storage bucket '$SUPABASE_S3_BUCKET'..."
docker run --rm -v "$DEST/storage:/data" rclone/rclone:latest sync \
  ":s3,provider=Other,endpoint=$SUPABASE_S3_ENDPOINT,access_key_id=$SUPABASE_S3_ACCESS_KEY_ID,secret_access_key=$SUPABASE_S3_SECRET_ACCESS_KEY,region=$SUPABASE_S3_REGION:$SUPABASE_S3_BUCKET" \
  /data
log "Storage sync done: $(du -sh "$DEST/storage" | cut -f1)"

# ── Rotate old snapshots ────────────────────────────────────────────────
RETENTION_DAYS=$((RETENTION_WEEKS * 7))
log "Removing snapshots older than $RETENTION_DAYS days..."
find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d -name '20*' -mtime "+$RETENTION_DAYS" -print -exec rm -rf {} +

log "Backup complete."
