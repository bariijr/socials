#!/bin/bash
# PostgreSQL initialization script — runs once on first container start

set -e
echo "Initializing Pounds MFI database extensions..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

  -- Performance: shared_preload_libraries should have pg_stat_statements

  GRANT ALL PRIVILEGES ON DATABASE $POSTGRES_DB TO $POSTGRES_USER;
EOSQL

echo "Database initialized."
