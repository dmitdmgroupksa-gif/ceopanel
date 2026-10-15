#!/usr/bin/env bash
set -euo pipefail
# Exercises archive publication and real age encryption without touching a real ERP/database.
command -v age >/dev/null
command -v age-keygen >/dev/null
backup_script="$(cd -- "$(dirname -- "$0")" && pwd)/backup.sh"
backup_test_base=$(realpath "${TMPDIR:-/tmp}")
backup_test_dir=$(mktemp -d "$backup_test_base/ceopanel-backup-check.XXXXXX")
cleanup() {
  [[ $(dirname -- "$(realpath "$backup_test_dir")") == "$backup_test_base" && $(basename -- "$backup_test_dir") == ceopanel-backup-check.* ]] || return 1
  rm -rf -- "$backup_test_dir"
}
trap cleanup EXIT
cd -- "$backup_test_dir"
age-keygen -o identity.txt 2>/dev/null
export BACKUP_RECIPIENT
BACKUP_RECIPIENT=$(age-keygen -y identity.txt)
docker() {
  if [[ "$*" == *"web tar"* && ${FAIL_DOCUMENTS:-0} == 1 ]]; then return 1; fi
  printf 'backup-fixture\n'
}
export -f docker
bash "$backup_script" >/dev/null
mapfile -t completed < <(find backups -mindepth 1 -maxdepth 1 -type d)
[[ ${#completed[@]} == 1 ]]
for archive in database.dump.age documents.tar.gz.age; do
  [[ $(age -d -i identity.txt "${completed[0]}/$archive") == backup-fixture ]]
done
if FAIL_DOCUMENTS=1 bash "$backup_script" >/dev/null 2>&1; then
  printf 'Failed archive unexpectedly succeeded\n' >&2
  exit 1
fi
[[ $(find backups -mindepth 1 -maxdepth 1 -type d | wc -l) == 1 ]]
[[ $(find backups -name '.pending.*' | wc -l) == 0 ]]
printf 'Backup encryption, complete-pair publication and failure cleanup passed\n'
