# ERP-wide read-only assistants

The internal assistant and external MCP share native Frappe tools for discovering
business DocTypes and reports, reading custom fields and child tables, checking
workflow state, and exporting files. This path requires no per-DocType mapping or
custom bridge installation. It uses the signed-in ERP user's session; browser and
MCP requests never fall back to the server's discovery API credentials.

## Configuration

Set these server-side settings in `.env.local` and restart the web server:

```dotenv
ERP_AI_READ_ENABLED=true
ERP_AI_READ_ROLES=System Manager
```

The switch authorizes business-data processing by the assistant. It does not grant
native ERP permissions. Add other exact ERP role names as a comma-separated list
only when those roles should receive ERP-wide assistant reading. An existing
agent assignment still restricts which roles can use that profile. All eight
profiles can otherwise use the native read tools for the permitted roles.

Internal chat also requires `DATABASE_URL` (PostgreSQL with the platform migrations
applied), `OPENAI_API_KEY`, and `OPENAI_MODEL`. Existing worker/knowledge features
have their own Redis, embedding-model and collection requirements; native ERP
reading does not require those features. Use `npm run db:migrate` against the
dedicated platform database, never the ERP database. The local ERP read switch is
enabled for System Manager. A dedicated localhost PostgreSQL database has been
started and migrated using `deploy/compose.local.yaml`; the existing ERP/database
containers were left untouched. OpenAI credentials/model were not present, so a
live model conversation was not run. Set `OPENAI_API_KEY` and `OPENAI_MODEL` in
the server environment to enable internal chat.

Local MCP OAuth is configured for `http://127.0.0.1:3001/api/mcp`, which desktop
clients/inspectors can access. A cloud-hosted client still needs a public HTTPS
origin. To restart the dedicated local database from this app directory:

```powershell
docker compose --env-file .env.local -f deploy/compose.local.yaml up -d --wait
npm run db:migrate
```

External MCP additionally requires the existing OAuth configuration:
`MCP_EXTERNAL_ENABLED=true`, a 64-hex-character `MCP_AUTH_SECRET`, and an explicit
public HTTPS `CEOPANEL_ORIGIN`. Connect clients to `/api/mcp` and authorize
`ceopanel:read ceopanel:erp-read` using the existing PKCE flow. The consent page
explains ERP-wide access, files, and visibility across companies. Existing grants
without `ceopanel:erp-read` receive no new native tools or file resources; reconnect
with the additional scope. A fresh grant still expires after eight hours or when
the delegated native session ends. Native permissions are checked on each read.

## Tools and example requests

| Tool                   | Purpose                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `erp_search_sources`   | Ranked, paginated discovery of enabled reports and standard/custom business DocTypes; metadata candidates may still be denied at execution. |
| `erp_describe_doctype` | Effective native/custom fields, Company links, and child schemas, including native field permission levels.                                 |
| `erp_search_records`   | Structured safe field filters, text search, selected columns and pagination.                                                                |
| `erp_read_document`    | Exact permitted record with custom fields and child rows.                                                                                   |
| `erp_describe_report`  | Native report permission check and static filter definitions, without evaluating report JavaScript.                                         |
| `erp_run_report`       | Native Query/Script/Custom reports and saved Report Builder fields, filters, child columns and count/sum/avg grouping.                      |
| `erp_check_approvals`  | Current workflow state, candidate next roles, possible future branches and actions currently available to this user.                        |
| `erp_list_attachments` | Attached-file IDs for a permitted business document.                                                                                        |
| `erp_export_file`      | Native document PDF, report PDF/CSV/XLSX, or supported existing attachment.                                                                 |

Examples:

- “Find our custom vehicle maintenance requests and show pending ones.”
- “Read quotation QTN-... and check which approval roles remain.”
- “Find the monthly sales report, run it for these dates, and give me a PDF.”
- “Download the PDF attached to this request.”

The model should discover source names, inspect schemas/filters, search for exact
records and ask for clarification when multiple reports/records match. A report
result is not itself an approval queue: check the relevant underlying documents.
Approval role candidates are not named assigned approvers. Conditional branches,
rejections, cancellations and loops are disclosed; the tool never invents a fixed
remaining approval sequence or treats a missing transition as proof of completion.

Internal follow-up questions reuse the previous completed answer and source
references after checking its owner, company, profile and current evidence access.
“New question” clears that context. Custom Report saved filter defaults are used
unless explicitly overridden; arbitrary JavaScript defaults are not evaluated.

## File delivery

`erp_export_file` supports two deliveries:

- `link` returns an MCP `resource_link` with an `erp://export/...` URI. Use MCP
  `resources/read` to retrieve its permission-checked binary resource.
- `embedded` returns an MCP embedded resource containing the file bytes. This is
  useful for clients that do not follow resource links.

Both are supported by the MCP protocol; how a client displays or saves a file
depends on that client. No external chat provider's attachment UI was validated.
Files are not automatically uploaded to another conversation or emailed.

Internal chat renders a download link to `/api/erp/files`. That route requires the
signed-in native session and checks current role, record, print/export or attached
parent permissions. It is not a public file URL and will not work in an external
client without the browser session; external clients should use the MCP resource
or embedded delivery. Descriptors contain identities/filters, never credentials;
they are requests, not bearer access tokens. They can be modified only to request
another currently permitted source. Link downloads regenerate from current ERP
data and are not immutable snapshots.

Document PDFs use the site's own print format and PDF endpoint. Report PDFs are
generated locally from native report rows, with filters, scope and row counts;
they do not reproduce a custom ERP report's print template. Reports can also be
exported as CSV or XLSX; text cells are protected against spreadsheet formulas.
Supported existing attachments: PDF, CSV, XLSX, DOCX, PNG, JPEG and text, attached
to a permitted business record on the same ERP site. Remote storage URLs, HTML,
SVG, arbitrary URLs/methods/paths and unlinked files are not accepted.

## Boundaries and limits

- ERP create/edit/submit/cancel/approval and proposal tools remain disabled.
  Internal chat is a read service and is no longer blocked as a proposal operation.
- The native read grant covers business data visible to the ERP account across
  the site. The selected Company is context, not an isolation guarantee. Record
  queries can explicitly filter Company; shared/custom sources may lack that link.
  Native custom reports may use fixed periods or ignore filters. Results disclose
  this instead of claiming reconciled company/period totals.
- Settings, authentication/security infrastructure, credential fields, arbitrary
  code fields and standalone child tables are excluded. Child rows are projected
  through their permitted parent. No SQL, report JavaScript, workflow condition or
  arbitrary RPC is executed by the application/model. Reports execute through
  Frappe's own permission-checked, read-only report endpoint; workflow conditions
  for the current user's transitions are evaluated by Frappe.
- Metadata discovery is not proof of record/report execution permission. Native
  permission failures are returned honestly. Report Builder reads preserve saved
  filters and combine additional filters. They use stable record-name ordering and
  support native count/sum/avg grouping. Presentation totals, chart settings, saved
  sorting and custom formatting are not reproduced. Restricted/stale fields or
  unsupported filter/group settings fail explicitly. Pages reflect live ERP data
  and are not a transaction-wide snapshot.
- Record pages: 100 rows; selected scalar fields: 30; document child table: 1,000
  rows; report: 10,000 rows; native JSON response: 16 MB; AI tool text: 220,000
  characters; file: 6 MB; report PDF: 500 rows with a width/text-size bound. Large results fail without silent
  truncation; narrow filters or use a complete supported export.
- Native provenance stores source references and content digests, not raw report
  rows. History rechecks access and reproduces a source before displaying an old
  answer; changed or revoked sources hide that answer. File access is checked again
  on download. Read-only external calls do not replay old reports unnecessarily.

## Validation on 2026-10-15

Read-only live checks under the supplied API account confirmed native roles,
quotation source discovery, an effective custom facilities schema and document,
quotation workflow inspection, a valid native quotation PDF, required Stock Balance
filters, native report results and PDF/CSV/XLSX exports. Live content/credentials
were not printed or committed. “DM Sales Report - Monthly” execution access was
denied by ERP and remains denied. These focused checks do not validate every
custom report's calculations, conditional approval path or external client's UI.

Saved “Daily Sales Invoice Report-FA” and “DM Facilities Report” returned native
rows under their saved filters. “DM Facilities Rent Agreement Details” referenced
an unknown/restricted column and was rejected rather than silently changing its
definition or returning an incomplete report.

Unit/protocol tests cover denied access, changed sessions, custom and child-field
projection, credential exclusions, structured query validation, mixed native total
rows, conditional workflow branches, self-approval restrictions, consent scopes,
MCP resource and embedded delivery, file size limits, unsafe paths, PDF generation,
and spreadsheet formula injection. Database/MCP integration and browser tests use
isolated fixtures and do not change ERP business records.

References: [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling),
[MCP tool file content](https://modelcontextprotocol.io/specification/2025-11-25/server/tools),
[MCP resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources),
[Frappe v14 reports](https://github.com/frappe/frappe/blob/version-14/frappe/desk/query_report.py),
[Frappe native export policy](https://github.com/frappe/frappe/blob/version-14/frappe/permissions.py),
[PDFKit](https://pdfkit.org/docs/text.html). Bundled Noto fonts retain their
[license](lib/erp-native/fonts/LICENSE).
