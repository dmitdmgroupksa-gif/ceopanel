# Durar Masagh enterprise platform

Business actions use the shared [MCP plugin and tool layer](./MCP.md), including the
dashboard's AI agents and authenticated external clients. External access stays disabled
until the public origin, authentication secret, approved AI fields, and staging mappings are set.

## Implemented application

The existing 18 dashboard tabs and 14 ERP record modules remain. Added web routes:
`/agents`, `/knowledge`, `/approvals`, `/notifications`, `/field-updates`, and `/integrations`.
Navigation stays at the top. English and Arabic share the same pages with RTL support.

Eight configured agent profiles use OpenAI Responses with schema-discovery, read-record, validated-report,
knowledge-search and proposal tools. Record fields are allowlisted at both the application
and ERP bridge. Financial dashboard aggregates use complete ERP report results; invalid
columns and numeric values fail instead of showing fabricated totals. Responses and
sources are persisted per user/company. Department role mappings also limit dashboard
navigation. Assign the CEO's actual ERP role to the Executive profile and departmental
agent profiles during discovery; no assumed role name grants CEO authority.

Saved answers, speech output and approval evidence recheck current collection, record and
field access. Report evidence is checked against a fresh permission-scoped report result;
changed snapshots are hidden until a new run is prepared. Missing source metadata or ERP
access fails closed. Native appended total rows are returned separately as `totalRow`;
dashboard aggregates count and sum detail records only. Agent usage totals include every
model call, including calls in runs that subsequently fail.

AI changes produce immutable pending proposals. Managers inspect their exact payload,
source evidence, and field-photo attachments, then approve or reject. Editing a pending
or rejected proposal increments its revision and clears approval. Approval atomically
claims a proposal, rechecks user permissions and source timestamps, and executes under
the approving user's ERP session. Native workflow transitions remain in ERPNext. Include
all legitimate workflow approvers, including the CEO where the native workflow escalates,
in the mapped approver roster; ERP still decides whether a transition is eligible.

Unknown write outcomes become `needs_reconciliation`. The ERP bridge records a minimal
transactional receipt; users check this receipt instead of repeating a write. Redis jobs
never contain ERP sessions and never execute business mutations. A worker repairs the
document outbox and interrupted proposal states every five minutes. Dashboards fetch
ERP data on demand and refresh every 60 seconds; there is no shared business-data cache.
Webhook events record source freshness. Worker maintenance timestamps describe platform
reconciliation, not a successful background ERP data sync.

ERP execution also requires a short-lived application HMAC authorization binding the payload,
proposal, company and approving ERP user; the bridge checks it before native writes.
Receipts bind the exact serialized approved payload and approving ERP user. Upgrade the
ERP bridge and web app together; older receipts without those bindings require administrator
investigation and cannot confirm execution. Delayed or out-of-order WhatsApp callbacks cannot
downgrade a confirmed delivery, and callbacks must match the configured business phone,
approved proposal, recipient and provider message identity.

Documents support text-based PDF, XLSX, CSV, Markdown and text, up to 10 MB. Scanned PDFs
need OCR and are marked failed. Approved collections and current role/company access
are checked before vector search. Pattern redaction removes recognizable credentials
and bank identifiers; collection owners must approve content because pattern matching
cannot identify every sensitive value. Document bytes and photos are privately stored,
not served from a public directory. PDF/image malware scanning and OCR are deployment
extensions that must be evaluated against the company's upload policy.

Field-input modules require the explicit `fieldInput` flag. Device drafts retain their
owner/company and stable UUID in IndexedDB. Reconnection submits a proposal, with at most
five PNG/JPEG photos totaling 10 MB. Repeated submissions return the existing proposal;
conflicting payloads cannot reuse its UUID. Photos remain proposal evidence in private
platform storage; approved record values are written to ERP. Automatic attachment transfer
into ERP File records is not enabled until the company's attachment mapping is supplied.

Offline request identities also bind photo contents and filenames. Device queue capacity
checks and insertion are atomic across browser tabs. Partial edits to existing ERP child
rows preserve server-owned and uneditable fields, while cross-parent row IDs are rejected.

## Configure and validate staging

1. Obtain a staging clone URL, actual Company document name, installed versions, and test
   accounts for CEO, managers, employees and an unauthorized/cross-company user.
2. Install the bundled `integrations/frappe` app on that clone. See its README. If the cloud
   plan cannot install custom apps, supply equivalent approved server methods; this bridge
   has not been installed or executed against the company's ERP.
3. Copy `platform.config.example.json` to ignored `platform.config.json`. Populate the
   actual field schemas, custom modules/reports, roles and individual approver usernames.
   Standard DocType names are in the existing workspace catalog. Leave read/write flags
   false until their scenarios pass. Copy the corresponding configuration into the ERP
   site's private `ceopanel_config`; the bridge independently checks the same allowlists.
4. Set `ERPNEXT_URL` to staging, `ERPNEXT_COMPANY` to its exact document name, and
   `PLATFORM_CONFIG_PATH` to the populated private JSON file. Run the discovery inventory
   through `/integrations` as a System Manager. Add custom fields and child-table schemas
   from this metadata, with company scope only where the actual DocType uses it.
5. Set a shared private receipt HMAC secret in `ERPNEXT_RECEIPT_SECRET` and the ERP site's
   `ceopanel_receipt_secret`. Set PostgreSQL/Redis URLs and run `npm run db:migrate`,
   `npm run worker`, and `npm run dev`.
   Migrations affect only the platform database. They do not alter ERP accounting tables.
6. Configure `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_EMBEDDING_MODEL` server-side.
   Approve fields/documents and account data controls, then enable `aiDataApproved`.
   `store:false` is used for Responses; this is not a claim of zero provider retention.
7. Verify each mapped dashboard against the company's ERP report with identical filters.
   Report aliases reference their ERP report name. Dashboard mappings reference a validated
   report alias and provide period filter names, four exact metric labels, aggregation
   operators, columns and optional grouped chart series. Exclude/report total rows according
   to the verified KPI definition; never sum detail rows and their totals together.
8. Test record reads first, followed by native workflow actions and approved writes. Repeat
   permission and reconciliation scenarios before enabling the same flags in production.

Configuration is loaded at startup for catalogs/adapters; restart web/worker services after
changing mappings. An unconfigured integration remains visibly unavailable.

Configuration validation catches duplicate identifiers, unknown agent/source references,
invalid period filters and upload roles without read access. Collections list all uploader
roles in `roles` as well as `uploadRoles`. Missing AI/embedding configuration keeps document
ingestion awaiting configuration; the worker resumes it once configuration is enabled.

## API and rollout interfaces

All application endpoints are under `/api/platform/`. They return private/no-store JSON,
except authorized attachment/audio downloads. Browser mutations require a same-origin
request and a verified ERP session. Sensitive operations never fall back to an admin token.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `status` | GET | Public configuration availability without secrets or company data |
| `health` | GET | PostgreSQL/Redis readiness; 503 when either dependency is unavailable |
| `agents`, `runs` | GET | Agent availability and the current user's permitted history |
| `agents/run` | POST | Run an agent in English/Arabic; five runs per user/minute |
| `proposals` | GET | Own proposals and permitted approval reviews |
| `proposals/review`, `edit`, `reconcile` | POST | Revision-aware review, editing and receipt reconciliation |
| `knowledge`, `knowledge/search` | GET / POST | Permitted collections/documents and vector search |
| `knowledge/upload`, `knowledge/retry` | POST | Private ingestion and failed-job retry |
| `field-modules`, `field-updates` | GET / POST | Validated field-input forms and idempotent photo/draft intake |
| `attachments/{id}` | GET | Authorized private photo download |
| `links` | GET | Permission-scoped ERP Link choices, including child-table fields |
| `notifications`, `notifications/read`, `inbox` | GET / POST / GET | Personal notifications and mapped channel messages |
| `inventory` | GET | System Manager discovery, queue counts and daily run counts |
| `events/erpnext` | POST | Raw-body Frappe HMAC-SHA256 event receipt |
| `events/whatsapp` | GET / POST | Verification handshake and signed delivery/message intake |
| `voice/session`, `voice/speech` | POST | Authenticated Realtime transcription and own-run speech output |
| `external/{id}` | GET | Normalized validated external read adapter |

Disable agent role mappings, adapter flags, collection approvals or channel flags to stop
a capability. Rollback never deletes or reverses ERP business transactions. Monitor queue
age/failures, interrupted proposals, webhook freshness, run usage and ERP/API errors.

## Later-channel activation gates

ERP email sending queues a message only after approval and native recipient verification.
Configure the ERP Email Account and the bridge's `emailSendRoles` (default: System Manager).
`messageFields.email` identifies the actual approved contact field; the user/model cannot
substitute another recipient. Reading existing email uses an explicitly mapped Communication
module/report. Automatic attachment extraction and reply association require the company's
email mapping before activation.

WhatsApp sending uses the Business Cloud API with a configured API version and verified
international-format ERP contact. Signed callbacks track delivery and reconcile ambiguous
sends. Text intake accepts only explicitly verified `channelIdentities`; unknown senders
receive no company information. Intake creates a personal inbox item, not an autonomous
agent run or reply. Business-account approval, recipient consent, applicable messaging
windows/templates and company recipient mappings must be validated before enabling this
text-only connector. Media intake/template messages need the actual company requirements.

Voice uses a server-created OpenAI Realtime transcription session; transcribed text can be
reviewed before it goes to the existing agent gateway. Speech reads only the caller's own
permitted completed run. Set the transcription/speech model and voice environment values;
microphone capture stops after two minutes. Arabic/English audio requires live model/device
evaluation before enabling `channels.voice`.

The Expo mobile client in `apps/ceopanel-mobile` embeds the same portal and device outbox.
Native bundles are buildable; device QA, signing and store distribution remain deployment
gates. Current SDK build-tool dependencies report upstream npm advisories; patch or assess
the trusted build toolchain before signed distribution. They are separate from the web
server's dependency tree.

Bank, payment, government, fleet and IoT adapters have a typed read contract and permission
boundary in `lib/platform/external.ts`. No provider-specific adapter is registered because
none of its APIs or schemas has been supplied. Predictive models and optimization remain
disabled until historical datasets, definitions and baseline evaluation results are supplied.

## Verification commands

`npm run typecheck`, `npm test`, `npm run test:browser`, and `npm run build` validate the web app.
Browser tests use dedicated port 3107 to avoid another application on port 3000.
`python -m unittest discover -s integrations/frappe/tests -v` from the repository root checks
bridge child-row protection, create-only field permissions and report total-row handling.
PostgreSQL lifecycle/agent evaluation tests run only when `PLATFORM_TEST_DATABASE_URL` points
to a disposable database; without it they are explicitly skipped. They use mocked OpenAI/ERP
services and do not spend API credits or mutate the company's ERP. The tests exercise real
SQL transactions, role isolation, vectors, all eight agent profiles, drafts, denied tools,
duplicate approvals, offline IDs, stale revisions and ambiguous-write reconciliation.

Live ERP reconciliation, actual model quality/cost evaluations, mobile device QA and external
provider tests still require the credentials and staging inputs listed above.
