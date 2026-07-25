#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# MikoPBX — Automated Backup Script
# Schedule: daily via cron  →  0 2 * * * /opt/mikopbx/backup/backup.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BACKUP_DIR="/var/backups/${HOSTNAME:-mikopbx}/mikopbx"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
LOG_FILE="/var/log/mikopbx_backup.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting MikoPBX backup — $TIMESTAMP"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Backup MikoPBX config volume
log "Backing up config volume (mikopbx_cf)..."
docker run --rm \
    -v mikopbx_cf:/source:ro \
    -v "$BACKUP_DIR":/dest \
    alpine tar czf /dest/mikopbx_cf_${TIMESTAMP}.tar.gz -C /source .

# Backup MikoPBX storage volume
log "Backing up storage volume (mikopbx_storage)..."
docker run --rm \
    -v mikopbx_storage:/source:ro \
    -v "$BACKUP_DIR":/dest \
    alpine tar czf /dest/mikopbx_storage_${TIMESTAMP}.tar.gz -C /source .

# Prune old backups
log "Pruning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +"$RETENTION_DAYS" -delete

# Log completion and size
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
log "Backup complete. Total backup size: $BACKUP_SIZE"
log "Files retained: $(ls -1 "$BACKUP_DIR"/*.tar.gz 2>/dev/null | wc -l)"
