# Linux deployment

For the complete Ubuntu EC2 commands for `panel.durar.ai`, including the instance,
DNS, generated private configuration, Docker, HTTPS, MCP, backups and updates,
use [AWS-EC2.md](AWS-EC2.md). The setup script never overwrites existing secrets.

1. Copy `.env.example` to ignored `.env`. Set the HTTPS public host, unique PostgreSQL
   password and ERP origin. OpenAI, WhatsApp and voice settings are optional; leave
   them empty until activating those features. Never commit the populated file.
2. Copy the application configuration example to `../platform.config.json` and fill only
   verified mappings. Native dashboards/workspace reads use existing ERP permissions
   and do not require the bridge; configure bridge allowlists only for mapped bridge features.
3. Run `docker compose up --build -d`. Migration runs before web/worker startup. Caddy
   terminates HTTPS; PostgreSQL, Redis and the web server are not publicly exposed.
4. Verify the portal, a staging ERP sign-in, migrations, queue scheduler and attachment
   storage permissions. Volumes persist database state, Redis jobs, documents/photos and TLS.
5. Reconcile the enabled read views against ERP after passing the acceptance gates.
   ERP writes remain disabled in this release; write mappings do not enable them.

The image includes internal MCP tools and the external `/api/mcp` endpoint. See
[MCP setup](../MCP.md) before activating external clients. Migration `004` adds consent,
OAuth client/code, and tool audit tables. Keep `MCP_EXTERNAL_ENABLED=false` until staging
permissions and the intended external client flows pass. Set the trusted HTTPS origin and
server-only auth secret before enabling it; clients complete ERP sign-in and explicit consent.
Migration `005` adds the permission-scoped query indexes. The migration runner applies
all five versions before the web/worker services start.

`backup.sh` requires `age` on the Linux host. Set `BACKUP_RECIPIENT` to the company's public
age recipient, run the script from this directory, and copy the complete timestamped backup
directory off-host. Both encrypted archives are published together after both pipelines
succeed; a failed dump/archive leaves no completed backup. Maintain an encrypted copy of
private configuration and secrets separately.

`bash test-backup.sh` checks real age encryption, complete-pair publication and failed archive
cleanup with fixture data. Run it on a Linux test host with `age` installed; it does not call
Docker or access the company's database.

`npm run test:backup` from the application directory performs a stronger recovery
check using a disposable PostgreSQL/pgvector container. It runs all migrations,
seeds synthetic receipts/audit history/documents, runs the real backup encryption
pipelines, authenticates and restores both archives, and verifies checksums,
permissions, relationships, vectors and identity sequences. It checks that an
incorrect age identity fails. Only the Compose transport is adapted to local
commands inside that container. No host volume, host port, Docker socket, platform
environment file, company database or ERP connection is passed into the test.
The container and tagged test image are removed afterward. CI runs both tests.

The web readiness endpoint checks PostgreSQL and Redis instead of configuration presence.
Compose passes PostgreSQL credentials as separate environment fields so reserved characters
in passwords work. Production images retain the worker's `tsx` runtime and omit development
dependencies. Verify readiness with `/api/platform/health` (200 ready, 503 unavailable).

Restore into an isolated deployment first, with web and workers stopped. Decrypt
both complete archives into a private temporary directory (`umask 077`) and require
successful age authentication before passing bytes to database/archive tools.
Use `pg_restore --single-transaction --exit-on-error --no-owner --no-privileges`
against a newly created recovery database and extract documents into its fresh
private volume. Preserve the runtime user's ownership and file permissions.
Verify document checksums, proposal receipts, audit rows and schema migration
versions, then restart web/worker and verify no ERP mutations execute automatically.
Never restore a test archive over the production platform database. The disposable
regression verifies the mechanism; actual off-host backup/key recovery remains an
operator acceptance test. Runtime private files use restrictive permissions;
encryption of production database/document volumes is a host deployment setting.

Worker database/Redis availability and queues are visible through the System Manager
inventory. Alert on growing failed/waiting queues, stale ERP events, failed agent runs and
`needs_reconciliation` proposals. Unknown execution results always require a verified ERP
receipt or vendor delivery acknowledgement.
