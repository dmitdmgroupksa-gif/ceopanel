#!/usr/bin/env bash
set -euo pipefail
# Run from deploy/. Stream through age so unencrypted archives never reach disk.
: "${BACKUP_RECIPIENT:?Set an age recipient}"
mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker compose exec -T postgres pg_dump -U ceopanel -Fc ceopanel | age -r "$BACKUP_RECIPIENT" > "backups/database-$stamp.dump.age"
docker compose exec -T web tar -C /app/.private-documents -czf - . | age -r "$BACKUP_RECIPIENT" > "backups/documents-$stamp.tar.gz.age"
printf 'Encrypted backup created: %s. Copy both files to the off-host backup location.\n' "$stamp"
