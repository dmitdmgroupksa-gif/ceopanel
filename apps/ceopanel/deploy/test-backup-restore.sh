#!/usr/bin/env bash
set -euo pipefail
umask 077
# Container-only test. Never source a platform .env or connect to a configured DB.
[[ ${CEOPANEL_BACKUP_TEST:-} == disposable ]] || {
  printf 'Run npm run test:backup; this script requires its disposable container.\n' >&2
  exit 1
}
export PGHOST=/var/run/postgresql PGUSER=ceopanel PGDATABASE=ceopanel
test_directory=$(mktemp -d /tmp/ceopanel-restore-test.XXXXXX)
cd -- "$test_directory"
for migration in /audit/db/*.sql; do
  psql -v ON_ERROR_STOP=1 -q -f "$migration" >/dev/null
done
mkdir -p /app/.private-documents restored-documents
document_id=17b43e42-7f0c-469d-bbea-b87315fc57bf
attachment_id=17b43e42-7f0c-469d-bbea-b87315fc57b0
printf 'Read-only recovery fixture — مستند اختبار\n' > "/app/.private-documents/$document_id"
printf '\211PNG\r\n\032\nfixture-photo\000\377' > "/app/.private-documents/$attachment_id"
chmod 600 /app/.private-documents/*
chown -R 1000:1000 /app/.private-documents
document_checksum=$(sha256sum "/app/.private-documents/$document_id" | cut -d' ' -f1)
attachment_checksum=$(sha256sum "/app/.private-documents/$attachment_id" | cut -d' ' -f1)
psql -q -v ON_ERROR_STOP=1 -v document_checksum="$document_checksum" -v attachment_checksum="$attachment_checksum" <<'SQL'
INSERT INTO knowledge_documents(id,company,owner,collection,title,filename,mime,checksum,status)
VALUES('17b43e42-7f0c-469d-bbea-b87315fc57bf','Fixture Company','reader@example.test','policies','Recovery fixture','fixture.txt','text/plain',:'document_checksum','ready');
INSERT INTO knowledge_chunks(document_id,chunk,content,embedding,model)
VALUES('17b43e42-7f0c-469d-bbea-b87315fc57bf',0,'Recovery fixture','[0.1,0.2,0.3]','fixture-model');
INSERT INTO proposals(id,company,proposer,agent,department,payload,status,result)
VALUES('17b43e42-7f0c-469d-bbea-b87315fc57b1','Fixture Company','reader@example.test','sales','sales','{"kind":"create","module":"customers","values":{"note":"fixture"}}','executed','{"receipt":"fixture-receipt"}');
INSERT INTO proposal_attachments(id,proposal,filename,mime,checksum)
VALUES('17b43e42-7f0c-469d-bbea-b87315fc57b0','17b43e42-7f0c-469d-bbea-b87315fc57b1','fixture.png','image/png',:'attachment_checksum');
INSERT INTO audit_events(actor,company,event,target,details)
VALUES('reader@example.test','Fixture Company','fixture.recovered','fixture','{"verified":true}');
SQL
expected_versions=$(psql -Atqc "SELECT string_agg(version,',' ORDER BY version) FROM platform_migrations")
[[ -n "$expected_versions" ]]
age-keygen -o identity.txt 2>/dev/null
export BACKUP_RECIPIENT
BACKUP_RECIPIENT=$(age-keygen -y identity.txt)
# Adapt only the container transport. The production script still executes real
# pg_dump/tar and age pipelines; no fixture dump or archive bytes are substituted.
docker() {
  [[ $# -ge 5 && "$1 $2 $3" == 'compose exec -T' ]] || return 1
  case "$4" in postgres|web) shift 4; command "$@" ;; *) return 1 ;; esac
}
export -f docker
bash /audit/backup.sh >/dev/null
mapfile -t completed < <(find backups -mindepth 1 -maxdepth 1 -type d)
[[ ${#completed[@]} == 1 ]]
backup_directory=${completed[0]}
[[ $(find "$backup_directory" -type f | wc -l) == 2 ]]
[[ $(find backups -name '.pending.*' | wc -l) == 0 ]]
# Authenticate the complete ciphertext before passing any bytes to restore tools.
age -d -i identity.txt -o database.dump "$backup_directory/database.dump.age"
age -d -i identity.txt -o documents.tar.gz "$backup_directory/documents.tar.gz.age"
createdb ceopanel_restored
pg_restore -d ceopanel_restored --single-transaction --exit-on-error --no-owner --no-privileges database.dump
tar -xzf documents.tar.gz -C restored-documents
export PGDATABASE=ceopanel_restored
[[ $(psql -Atqc "SELECT string_agg(version,',' ORDER BY version) FROM platform_migrations") == "$expected_versions" ]]
[[ $(psql -Atqc "SELECT checksum FROM knowledge_documents") == "$document_checksum" ]]
[[ $(psql -Atqc "SELECT checksum FROM proposal_attachments") == "$attachment_checksum" ]]
[[ $(sha256sum "restored-documents/$document_id" | cut -d' ' -f1) == "$document_checksum" ]]
[[ $(sha256sum "restored-documents/$attachment_id" | cut -d' ' -f1) == "$attachment_checksum" ]]
for file in restored-documents/*; do
  [[ $(stat -c '%a:%u:%g' "$file") == 600:1000:1000 ]]
done
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM knowledge_chunks WHERE chunk=0 AND embedding::text='[0.1,0.2,0.3]') THEN
    RAISE EXCEPTION 'Vector data was not restored';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM proposals WHERE status='executed' AND result->>'receipt'='fixture-receipt') THEN
    RAISE EXCEPTION 'Execution receipt was not restored';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM audit_events WHERE id=1 AND details->>'verified'='true') THEN
    RAISE EXCEPTION 'Audit history was not restored';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='audit_actor_company_event_time') THEN
    RAISE EXCEPTION 'Query index was not restored';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='proposal_attachments'::regclass AND contype='f') THEN
    RAISE EXCEPTION 'Attachment relationship was not restored';
  END IF;
END $$;
INSERT INTO audit_events(actor,company,event,target) VALUES('reader@example.test','Fixture Company','fixture.after_restore','fixture');
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM audit_events WHERE id=2) THEN
    RAISE EXCEPTION 'Identity sequence was not restored';
  END IF;
END $$;
SQL
age-keygen -o wrong-identity.txt 2>/dev/null
if age -d -i wrong-identity.txt "$backup_directory/database.dump.age" >/dev/null 2>&1; then
  printf 'Backup incorrectly accepted the wrong identity\n' >&2
  exit 1
fi
printf 'Real PostgreSQL/vector, receipts, audit sequence, private-file checksums/permissions and wrong-key restore checks passed\n'
