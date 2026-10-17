# Read-only MCP showcase review — 17 October 2026

The review covered the native ERP tools, advertised schemas and instructions,
tool results, permission failures, file delivery, audit evidence and the existing
OAuth/HTTP transport. ERP writes remain disabled in code. No tunnel or external
ChatGPT connection was activated during this review.

## Fixes

| Finding | Resulting behavior |
| --- | --- |
| Attachment discovery stopped at 100 files without a continuation contract. | Permission-checked pages have `offset`, `limit`, `hasMore` and `nextOffset`, with stable ordering and one-row lookahead. Malformed/duplicate file identities fail. Only file metadata is projected; no file paths or unrelated fields are returned. |
| Attachment answers lacked reproducible native evidence. | Audit evidence identifies the parent and page. History rechecks parent access and the same page; changed or revoked attachment sources hide the previous answer. |
| Concurrent calls shared one mutable evidence array. | Each call takes its own evidence snapshot. Its audit contains only its own additions; failed or oversized results do not publish evidence. |
| Errors gave little recovery guidance. | Tool failures include a stable `code`, HTTP-style `status`, `retryable` and `nextStep`. Missing report filters, denied access, expired authentication, large results, rate limits and upstream failures have distinct guidance. Unexpected upstream error text is not disclosed. |
| Expiry during a tool call did not request ChatGPT reauthentication. | External tools advertise OAuth scopes through the SDK-supported `_meta.securitySchemes` compatibility field. Tool-level 401 errors include `mcp/www_authenticate`; HTTP 401 responses also advertise the resource metadata, error and scopes. Ordinary 403 permission errors do not trigger sign-in. |
| Rate-limit errors lacked a retry interval. | Tool errors include a 60-second interval; HTTP rate-limit responses include `Retry-After: 60`. |
| External exports exposed a relative browser download URL that needs a separate cookie session. | External file results omit that URL and explain MCP resource reading or embedded delivery. Internal application downloads retain their authenticated browser URL. No public file link or fabricated sandbox link is introduced. |
| MCP record lists did not reject malformed identities or verify an explicit Company filter against returned rows. | The shared native reader validates unique nonempty identities and includes/checks Company when explicitly filtered. Results outside the requested Company fail before any rows are returned. |
| Pagination and source selection were easy to misinterpret. | Native tools have readable titles, bounded offsets and explicit continuation descriptions. Server instructions require discovery, exact schemas/filters, honest scope, total-row handling and conditional-workflow caveats. ERP content is treated as data, never instructions. |

The application does not retry permission failures, create fallback data, alter
broken ERP reports, evaluate report JavaScript locally, execute workflows or
claim an approval role is a named assigned approver.

## Verification

- 302 unit/protocol tests passed with one worker, including 10 added regression
  cases. The initial run alongside container integration work hit the existing
  PDF extraction test's five-second cold-start timeout; the isolated full rerun
  passed without weakening the test or changing its timeout.
- All 42 disposable PostgreSQL/Redis integration tests passed, including OAuth
  code binding, rotating refresh/revocation, native file resources and current/
  legacy SDK transport. These use ERP fixtures and do not modify live ERP.
- Strict TypeScript/unused-symbol checks and the production build passed. The
  final client scan checked 63 built files against four configured server secrets
  and encoded forms, with no matches.
- All 108 production-build desktop/mobile browser tests passed, including native
  login, read-only consent, consent outage recovery, Explorer and file links.
- A controlled live MCP SDK rehearsal passed all nine native tools: discovery,
  effective schema, Company-filtered records, document details, workflow,
  attachments, report definition, report execution and file export.
- The live rehearsal retrieved a valid native quotation PDF through
  `resources/read` and verified embedded CSV, XLSX and PDF report bytes. It made
  **69 ERP GET requests, zero ERP mutations and had zero failed checks**.
  It logged counts, byte sizes and status only; business rows, identifiers,
  credentials and generated files were not written to a report or artifact.

The live rehearsal used the existing approved API identity through a controlled
CLI fetch override and the real MCP SDK. It does not substitute for a native
browser sign-in or a real ChatGPT OAuth connection. No API-token fallback was
added to the application. Tool invocation intents and source references were
recorded by the existing local audit database.

## ChatGPT acceptance still required

For the first rehearsal, use the verified Quotation record type and Stock Balance
report. Ask ChatGPT to discover the permitted record identifier and describe the
report's required filters, then provide the intended dates and Company. Keep the
Stock Balance request narrow with a permitted item filter before exporting. Do
not select reports already marked inaccessible or stale in the readability audit
for the opening demonstration.

Connect the intended HTTPS demo origin, complete native ERP sign-in and explicit
read consent, refresh the ChatGPT tool metadata, then start a new conversation.
Check discovery, a filtered read, a known working report, workflow inspection,
PDF/spreadsheet handling, a denied source, expiry and revocation. ChatGPT's file
presentation must be observed before promising an attachment during the showcase.

Native report permissions and definitions remain authoritative. The earlier
readability audit identifies inaccessible or stale reports; they still produce
honest errors. A restricted demo account and reconciliation against ERP remain
the production acceptance work described in the application audit.

References: [OpenAI tool authentication](https://developers.openai.com/plugins/build/auth),
[OpenAI tool metadata reference](https://developers.openai.com/plugins/reference),
[ChatGPT connection and test flow](https://developers.openai.com/plugins/deploy/connect-chatgpt).

## Personal authentication and permissions follow-up

The original integration already delegated each external grant to the consenting
user's native ERP session. It did not use the discovery API key for employee data
reads. This follow-up adds native Frappe OAuth login, fixes ordinary employee
discovery/setup, and removes the original-company restriction on ERP-wide grants.

- Native Frappe authorization uses browser-bound one-use state, PKCE S256, a fixed
  registered callback and server-side token exchange. Personal tokens are encrypted
  in platform migration 006; browser sessions remain opaque. Logout revokes the
  local session before attempting upstream revocation. Refresh checks the owner.
- Every MCP request refreshes the native identity, roles and Company list. The new
  `erp_list_companies` tool lists that user's current choices. Losing the original
  consent company does not block their other permitted companies. Positive Company
  selectors are checked against the current list; native ERP permissions remain
  authoritative for records, fields, reports and report-specific scope.
- Ordinary Desk users can use personal MCP setup. Connection listing/revocation
  filters by authenticated owner across companies. A configured role allowlist
  still restricts access. Docker's PGHOST database settings are recognized.
- Custom business DocTypes assigned to framework modules are no longer excluded
  solely by module. Native Link metadata discovery works when administrative
  DocType listing is denied, without ignoring business permissions. Frappe v14's
  translated catalog ignores offsets, so it is fetched once with a size limit.
- Dashboard navigation checks actual adapter sources and required field levels
  without loading business rows. Denied views are hidden; direct links display
  **No access**. Upstream outages and expired authentication are not disguised as
  empty or forbidden dashboards. Chart series use distinct light/dark colours.

Live GET-only checks found three oil-change reports backed by Vehicle, rather
than a DocType named Oil Change Report. All three definitions were authorized;
the saved alert report executed with 72 rows and seven columns. The other two
Query Reports were not executed. A metadata-only dashboard check found 17
connected views. These checks used the local API audit identity and do not
establish restricted employees' access. No live ERP business writes occurred.

Native Frappe OAuth is prepared but cannot be activated or accepted against the
live ERP until its OAuth Client exists. Follow [FRAPPE-OAUTH.md](deploy/FRAPPE-OAUTH.md)
for exact registration fields, private environment settings, migration and EC2
restart commands. Verify separate restricted employees and real external-client
behavior after configuration. The existing password/SID login remains usable
until native OAuth is configured.

Final local verification: 354 unit/protocol tests and 45 disposable database
integration tests passed. All 118 desktop/mobile browser cases passed, with two
new selector mistakes corrected and those cases rerun. Strict TypeScript and
the production build passed. A client scan checked 64 built files against four
configured server secrets and encoded forms with no matches. This code has not
been deployed to AWS as part of this follow-up.
