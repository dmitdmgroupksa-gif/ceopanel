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
