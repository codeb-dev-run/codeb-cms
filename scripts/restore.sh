#!/bin/bash
# PostgreSQL Restore Script for vsvs-cms
# Usage: ./restore.sh <backup_file.sql.gz>

set -e

# Configuration
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-vsvs_cms}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    echo ""
    echo "Available backups:"
    ls -lh /backups/*.sql.gz 2>/dev/null || echo "No backups found in /backups/"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "=== PostgreSQL Restore Started ==="
echo "Time: $(date)"
echo "Database: $POSTGRES_DB"
echo "Backup File: $BACKUP_FILE"
echo ""
echo "WARNING: This will overwrite the current database!"
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

echo ""
echo "Restoring database..."

# Perform restore
gunzip -c "$BACKUP_FILE" | PGPASSWORD="$POSTGRES_PASSWORD" psql \
    -h "$POSTGRES_HOST" \
    -p "$POSTGRES_PORT" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --quiet

if [ $? -eq 0 ]; then
    echo ""
    echo "=== Restore Completed Successfully ==="
    echo "Time: $(date)"
else
    echo ""
    echo "ERROR: Restore failed!"
    exit 1
fi
