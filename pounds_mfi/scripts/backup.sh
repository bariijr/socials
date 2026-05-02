#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  Pounds MFI — PostgreSQL Backup Script
#  Runs inside the backup container or via cron
# ─────────────────────────────────────────────────────────────

set -euo pipefail

# Config from environment
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_USERNAME="${DB_USERNAME:-pounds_user}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-pounds_mfi}"
BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
LOG_FILE="${BACKUP_DIR}/backup.log"

# SMTP
SMTP_HOST="${SMTP_HOST:-}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASS="${SMTP_PASS:-}"
BACKUP_EMAIL="${BACKUP_EMAIL_RECIPIENTS:-}"

# SFTP
SFTP_HOST="${SFTP_HOST:-}"
SFTP_USER="${SFTP_USER:-}"
SFTP_KEY="${SFTP_KEY_PATH:-}"
SFTP_PATH="${SFTP_REMOTE_PATH:-/backups}"

# Create backup directory
mkdir -p "${BACKUP_DIR}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/pounds_mfi_${TIMESTAMP}.sql.gz"
BACKUP_FILENAME="pounds_mfi_${TIMESTAMP}.sql.gz"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

log "Starting backup: ${BACKUP_FILENAME}"

# Dump database
if PGPASSWORD="${DB_PASSWORD}" pg_dump \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USERNAME}" \
    -d "${DB_NAME}" \
    --no-owner \
    --no-acl \
    --format=plain \
    | gzip -9 > "${BACKUP_FILE}"; then

  SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
  SHA256=$(sha256sum "${BACKUP_FILE}" | cut -d' ' -f1)
  log "Backup complete: ${SIZE} — SHA256: ${SHA256}"

  # Email notification (using curl + SMTP)
  if [[ -n "${SMTP_HOST}" && -n "${BACKUP_EMAIL}" ]]; then
    log "Sending email notification..."
    for EMAIL in $(echo "${BACKUP_EMAIL}" | tr ',' ' '); do
      curl -s --url "smtp://${SMTP_HOST}:587" \
           --ssl-reqd \
           --mail-from "${SMTP_USER}" \
           --mail-rcpt "${EMAIL}" \
           --user "${SMTP_USER}:${SMTP_PASS}" \
           -T - <<EOF 2>/dev/null && log "Email sent to ${EMAIL}" || log "Email failed to ${EMAIL}"
From: Pounds MFI Backup <${SMTP_USER}>
To: ${EMAIL}
Subject: Daily DB Backup — ${TIMESTAMP}
Content-Type: text/plain

Database backup completed successfully.

File: ${BACKUP_FILENAME}
Size: ${SIZE}
SHA256: ${SHA256}
Time: $(date)

System: Pounds Microfinance Ltd
EOF
    done
  fi

  # SFTP upload
  if [[ -n "${SFTP_HOST}" && -f "${SFTP_KEY}" ]]; then
    log "Uploading to SFTP..."
    sftp -i "${SFTP_KEY}" -o StrictHostKeyChecking=no \
         "${SFTP_USER}@${SFTP_HOST}" <<EOF && log "SFTP upload complete" || log "SFTP upload failed"
put ${BACKUP_FILE} ${SFTP_PATH}/${BACKUP_FILENAME}
bye
EOF
  fi

  # Cleanup old backups
  log "Cleaning up backups older than ${RETENTION_DAYS} days..."
  find "${BACKUP_DIR}" -name "pounds_mfi_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
  REMAINING=$(find "${BACKUP_DIR}" -name "*.sql.gz" | wc -l)
  log "Cleanup done. ${REMAINING} backup(s) remaining."

else
  log "ERROR: Backup failed!"
  exit 1
fi

log "Backup job finished."
