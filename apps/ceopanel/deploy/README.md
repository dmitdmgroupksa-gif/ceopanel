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

`backup.sh` requires `age` on the Linux host. Set `BACKUP_RECIPIENT` to the company's public
age recipient, run the script from this directory, and copy both encrypted outputs off-host.
The script uses pipefail so a failed database dump/archive cannot silently create a valid
backup. Maintain an encrypted copy of private configuration and secrets separately.

Restore into an isolated staging deployment first: decrypt the database archive and feed
it to PostgreSQL `pg_restore` for the staging platform database; decrypt the document archive
into its private document volume. Verify document checksums, proposal receipts, audit rows
and schema migration versions. Then restart worker/web and verify no ERP mutations execute
automatically. Never restore a test archive over the production platform database.

Worker database/Redis availability and queues are visible through the System Manager
inventory. Alert on growing failed/waiting queues, stale ERP events, failed agent runs and
`needs_reconciliation` proposals. Unknown execution results always require a verified ERP
receipt or vendor delivery acknowledgement.
