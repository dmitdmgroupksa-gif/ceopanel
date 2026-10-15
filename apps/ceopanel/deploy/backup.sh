#!/usr/bin/env bash
set -euo pipefail
umask 077
# Run from deploy/. Stream through age so unencrypted archives never reach disk.
: "${BACKUP_RECIPIENT:?Set an age recipient}"
command -v age >/dev/null
command -v docker >/dev/null
mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%S%NZ)
backup_task_dir=$(mktemp -d backups/.pending.XXXXXX)
cleanup() {
  rm -f -- "$backup_task_dir/database.dump.age" "$backup_task_dir/documents.tar.gz.age"
  rmdir -- "$backup_task_dir" 2>/dev/null || true
}
trap cleanup EXIT
docker compose exec -T postgres pg_dump -U ceopanel -Fc ceopanel | age -r "$BACKUP_RECIPIENT" > "$backup_task_dir/database.dump.age"
docker compose exec -T web tar -C /app/.private-documents -czf - . | age -r "$BACKUP_RECIPIENT" > "$backup_task_dir/documents.tar.gz.age"
# Publish a complete encrypted pair with one directory rename. Failed pipelines
# leave no archive that could be mistaken for a successful backup.
backup_target_dir="backups/$stamp-${backup_task_dir##*.pending.}"
mv -- "$backup_task_dir" "$backup_target_dir"
trap - EXIT
printf 'Encrypted backup created: %s. Copy the complete directory to the off-host backup location.\n' "$backup_target_dir"
