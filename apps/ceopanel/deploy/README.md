# Linux deployment

1. Copy `.env.example` to ignored `.env`. Set the HTTPS public host, unique PostgreSQL
   password, staging ERP origin and server-side OpenAI values. Add WhatsApp/voice environment
   values only when activating those channels. Never commit the populated file.
2. Copy the application configuration example to `../platform.config.json` and fill only
   verified staging mappings. Configure the matching private ERP bridge allowlists.
3. Run `docker compose up --build -d`. Migration runs before web/worker startup. Caddy
   terminates HTTPS; PostgreSQL, Redis and the web server are not publicly exposed.
4. Verify the portal, a staging ERP sign-in, migrations, queue scheduler and attachment
   storage permissions. Volumes persist database state, Redis jobs, documents/photos and TLS.
5. Promote read mappings before write mappings after passing the staging acceptance gates.

The image includes internal MCP tools and the external `/api/mcp` endpoint. See
[MCP setup](../MCP.md) before activating external clients. Migration `004` adds consent,
OAuth client/code, and tool audit tables. Keep `MCP_EXTERNAL_ENABLED=false` until staging
permissions and the intended external client flows pass. Set the trusted HTTPS origin and
server-only auth secret before enabling it; clients complete ERP sign-in and explicit consent.

`backup.sh` requires `age` on the Linux host. Set `BACKUP_RECIPIENT` to the company's public
age recipient, run the script from this directory, and copy the complete timestamped backup
directory off-host. Both encrypted archives are published together after both pipelines
succeed; a failed dump/archive leaves no completed backup. Maintain an encrypted copy of
private configuration and secrets separately.

`bash test-backup.sh` checks real age encryption, complete-pair publication and failed archive
cleanup with fixture data. Run it on a Linux test host with `age` installed; it does not call
Docker or access the company's database.

The web readiness endpoint checks PostgreSQL and Redis instead of configuration presence.
Compose passes PostgreSQL credentials as separate environment fields so reserved characters
in passwords work. Production images retain the worker's `tsx` runtime and omit development
dependencies. Verify readiness with `/api/platform/health` (200 ready, 503 unavailable).

Restore into an isolated staging deployment first: decrypt the database archive and feed
it to PostgreSQL `pg_restore` for the staging platform database; decrypt the document archive
into its private document volume. Verify document checksums, proposal receipts, audit rows
and schema migration versions. Then restart worker/web and verify no ERP mutations execute
automatically. Never restore a test archive over the production platform database.

Worker database/Redis availability and queues are visible through the System Manager
inventory. Alert on growing failed/waiting queues, stale ERP events, failed agent runs and
`needs_reconciliation` proposals. Unknown execution results always require a verified ERP
receipt or vendor delivery acknowledgement.
