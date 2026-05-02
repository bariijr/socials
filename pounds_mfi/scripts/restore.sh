#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  Pounds MFI — Database Restore Script
#  Usage: ./restore.sh <backup_file.sql.gz>
# ─────────────────────────────────────────────────────────────

set -euo pipefail

BACKUP_FILE="${1:-}"

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  echo ""
  echo "Available backups:"
  ls -lh /app/backups/*.sql.gz 2>/dev/null || echo "  No backups found in /app/backups/"
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Error: File not found: ${BACKUP_FILE}"
  exit 1
fi

DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_USERNAME="${DB_USERNAME:-pounds_user}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-pounds_mfi}"

echo "WARNING: This will REPLACE all data in ${DB_NAME}!"
echo "File: ${BACKUP_FILE}"
echo ""
read -p "Type 'RESTORE' to confirm: " CONFIRM

if [[ "${CONFIRM}" != "RESTORE" ]]; then
  echo "Restore cancelled."
  exit 0
fi

echo "Restoring backup..."

# Drop and recreate
PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USERNAME}" -d postgres <<EOF
DROP DATABASE IF EXISTS ${DB_NAME};
CREATE DATABASE ${DB_NAME} OWNER ${DB_USERNAME};
EOF

# Restore
zcat "${BACKUP_FILE}" | PGPASSWORD="${DB_PASSWORD}" psql \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USERNAME}" \
    -d "${DB_NAME}" \
    --set ON_ERROR_STOP=1

echo "Restore complete!"
