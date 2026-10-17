# Application audit — 17 October 2026

This audit covers the CEO Panel web application, its mobile wrapper, the local
platform database, native ERP reader, MCP integration, Frappe bridge and deployment
scripts. Existing unrelated repository templates were left alone. This report
describes local verification; it is not a production deployment certificate.

Feature follow-up: the [ERP Explorer, workflow inspector and daily briefing](ERP-EXPLORER.md)
are implemented without a model dependency. This change passed 292 unit/protocol
tests, 108 desktop/mobile browser tests, 10 localhost preview tests,
type/unused-symbol checks, the production build and a client secret scan.
Controlled native ERP checks used 203 GET requests
with no failures or mutations. These supplement the historical audit evidence
below; deployment and least-privilege acceptance gates remain unchanged.

A subsequent [MCP showcase review](MCP-SHOWCASE-REVIEW.md) fixes response recovery,
attachment pagination/evidence, concurrent audit isolation and external file guidance.
It passed 302 unit/protocol tests, 42 disposable database/OAuth integration tests,
108 production-build browser tests, strict TypeScript checks and a production
build. A live MCP SDK rehearsal passed
all nine native tools and PDF/CSV/XLSX delivery with 69 ERP GET requests and zero
ERP mutations. Actual ChatGPT connection and file presentation remain acceptance
work once the HTTPS demo origin is available.

Deployment follow-up: the user selected `panel.durar.ai` for AWS EC2. The
[EC2 runbook](deploy/AWS-EC2.md) and private-configuration generator are prepared.
The Linux image, fresh database/Redis startup, migrations, readiness, production
issuer metadata and Caddy configuration passed local container checks. Actual
AWS provisioning, DNS/certificate issuance and ChatGPT acceptance remain pending.

## Product decision

The core is deterministic code and permission-scoped ERP API reads. Dashboards,
record search, filtering, calculations, exports and approval inspection work
without a model. AI, voice and semantic knowledge search are optional additions.
Assistant assignments must not change native dashboard access. The mobile app
opens dashboards rather than the optional assistant page.

Creation, editing, submission, cancellation, workflow execution and outbound
messages remain disabled. Approval views inspect state and possible approver
roles; they do not approve documents. Disabled uploads and write controls now
match the server's read-only policy.

## Architecture and feature coverage

| Area | Implementation and audit coverage |
| --- | --- |
| Web | Next.js 16.4, React 19.3, TypeScript, Tailwind; eight main destinations; English/Arabic and RTL; desktop, mobile and tablet navigation. |
| Authentication | ERPNext SID, HttpOnly/SameSite cookies, native two-factor challenges, origin validation, safe return URLs, expiry and remote logout. Protected views verify identity and Company before mounting. Local anonymous preview cannot read business data. |
| Dashboards | Ten financial/people adapters and six operational adapters; native field permissions, Company scope, reporting dates, complete pagination, numeric validation, search, CSV export and trusted ERP links. Unconnected slots disclose their status. |
| ERP workspace | 28 mapped read-only lists, permission-filtered schemas, record details and pagination. Shared catalogs retain native ERP permission scope. |
| ERP-wide reader | Custom DocType discovery, metadata, record search, reports, workflow inspection and PDF/CSV/XLSX/file delivery; parent/child and field permissions; private credential/settings types excluded. The subsequent [Explorer release](ERP-EXPLORER.md) exposes these through a non-AI workspace UI and adds a deterministic daily briefing. |
| Optional platform | PostgreSQL 17/pgvector, Redis/BullMQ workers, permission-protected private files, encrypted MCP grants, conversations/evidence, knowledge, field drafts, notification/inbox views and deferred proposal execution. Backup archives are encrypted; runtime volume encryption is a deployment setting. No AI provider is needed by native dashboard/workspace endpoints. |
| MCP | Internal in-memory transport; external OAuth/PKCE, encrypted grants, consent, Company/native permissions, rate limits and resource downloads. External clients still require a public HTTPS deployment for live acceptance. |
| Mobile | Expo 57, React Native 0.86.3 WebView wrapper, origin/navigation restrictions, safe-area layout, connection feedback, language selection and Android Back navigation. |
| Deployment | Standalone Node 24 web/worker containers, PostgreSQL/Redis, Caddy HTTPS, additive migrations and age-encrypted backup scripts. |
| SEO | Internal authenticated business application; metadata is present and indexing is disabled intentionally. Public marketing SEO is outside this application. |

## Findings and fixes

No new critical finding was confirmed during this pass. The following concrete
findings were addressed; this does not imply that unknown vulnerabilities cannot
exist.

| Severity | Finding | Fix and affected files |
| --- | --- | --- |
| HIGH | Older native adapters relied on ERP API field filtering, which is optional in Frappe v14. Restricted fields could be selected or used for search/filters. | New `lib/erp-native/permissioned-reader.ts` checks effective metadata before queries and projects only requested scalar fields. Applied to `dashboard-server.ts`, `erpnext-server.ts` and `erp-native/workspace.ts`. Restricted workspace columns/search fields are omitted; required restricted dashboard fields reject the view. |
| HIGH | Ambiguous/duplicate record identities, malformed list responses, lost OR filters and unchecked Company rows could produce incomplete or incorrectly scoped results. | `erpnext-client.ts` reuses validated pagination and preserves OR filters. Native snapshot/workspace readers reject duplicates, mismatched identities and cross-Company results. |
| HIGH | Native financial calculations accepted dates/statuses that did not match their requested submitted-document period; mapped aggregates could overflow. | `erp-native/dashboards.ts` validates submitted status, actual calendar dates and returned period; `workspace.ts` validates real dates; `platform/report-mapping.ts` rejects nonfinite totals. |
| HIGH | Frappe bridge dashboard period input could override the verified Company. | `integrations/frappe/ceopanel_bridge/api.py` rejects conflicting Company input and malformed period objects; verified Company wins. Native report defaults/prepared snapshots are disabled. Bridge code was tested locally, not installed on the live ERP. |
| HIGH | File descriptors could return malformed or encoded traversal paths before download-time validation. | Shared `lib/erp-file-path.ts` validates both descriptor creation and credential-bearing binary requests; malformed, double-encoded and traversal paths reject early. |
| MEDIUM | An inaccessible configured default Company locked users out despite access to another Company. | `erpnext-server.ts` selects a permitted fallback only for implicit selection. Explicit denied Company requests still return 403. |
| MEDIUM | Adding optional agent assignments could hide native dashboards. | `dashboard-server.ts` derives dashboard restrictions only from explicit dashboard mappings. Regression checks also verify explicit role restrictions still reject access. |
| MEDIUM | Read-only UI offered uploads/submission/mark-read operations that the server would reject. | `components/platform-panel.tsx` and `field-updates.tsx` align controls with policy. `app/api/platform/[...path]/route.ts` rejects disabled operations before reading request bodies; inherited route names return 404. |
| MEDIUM | Arabic select labels could replace underlying native values; string `"0"` appeared checked; date-only inputs hid timestamps. | `workspace-fields.tsx` preserves native option values, parses checkbox values explicitly and displays complete read-only dates/timestamps. |
| MEDIUM | Conversation history navigation and stale async completions could interfere with an active answer. | `platform-panel.tsx` disables conflicting history actions and ignores obsolete operation completion. |
| MEDIUM | MCP consent confused session loading, expired authentication and server unavailability. | `mcp-consent.tsx` separates loading/sign-in/error states and provides retry for recoverable errors. |
| MEDIUM | History revalidation repeated identical ERP reads for each previous answer. | `platform/evidence.ts` deduplicates sources within one request while comparing each saved digest independently; next requests recheck permissions and source data. |
| MEDIUM | Heavy MCP/document/AI dependencies loaded on status/native routes and before rejecting anonymous requests. | Lightweight `mcp/human-tool.ts`, `mcp/binary.ts` and `upload-limits.ts` defer the heavy integrations until an authenticated tool call needs them. Ordinary ERP routes remain independent of AI setup. |
| MEDIUM | Agent transaction/cleanup failure paths could leave unusable connections or convert a successful response into a misleading retry failure. | `platform/agents.ts` uses the common transaction helper and logs cleanup failure without exposing private payloads; `mcp/client.ts` closes server resources even if client cleanup fails. |
| MEDIUM | Common permission-scoped queries lacked matching indexes. | Additive `db/005-query-indexes.sql` adds seven indexes for audit quotas, notifications/inbox, attachments, knowledge catalog/maintenance and MCP client registration. One shared migration manifest drives migration checks and tests. |
| MEDIUM | Voice read tools were excluded by the global read-only policy although they do not execute ERP mutations. | `mcp/platform-services.ts` classifies voice input/output as read operations; model configuration, human access and evidence permissions still apply. Voice remains unconfigured locally. |
| MEDIUM | Mobile Xcode tooling included the vulnerable uuid version; Android Back did not navigate WebView history. | Scoped compatible uuid override and lockfile update; `apps/ceopanel-mobile/App.tsx` handles Back and removes its listener on unmount. |
| LOW | Rollout diagnostics made absent optional AI look like a mandatory failure; documentation described an empty adapter registry. | `platform/readiness.ts`, `rollout-readiness.tsx`, Arabic copy and README now reflect optional assistants and the implemented native adapters. |
| LOW | Unused symbols and resource-heavy concurrent test runs reduced maintainability/reliability. | Removed confirmed unused symbols, reduced Vitest worker concurrency, added strict unused-symbol checks and mobile build validation to CI. Tests retain their assertions. |
| MEDIUM | Backup checks verified encrypted fixture text but did not prove a real database/private-file recovery. | New `scripts/test-backup-restore.ts`, `deploy/Dockerfile.backup-test` and `deploy/test-backup-restore.sh` exercise actual dump, encryption, restore and integrity checks in an isolated, network-disabled container. CI runs the check. Recovery instructions require full ciphertext authentication before transactional restoration. |

The preceding focused review also fixed shared-child report isolation, Arabic
identifiers, operational date/paid-flag calculations, stale Company/period data,
unsafe record links and CSV formula handling. See [REVIEW-FIXES.md](REVIEW-FIXES.md).

Frappe's optional API field-permission behavior was checked against the
[installed v14.100.0 implementation](https://github.com/frappe/frappe/blob/v14.100.0/frappe/model/db_query.py).
Application enforcement does not depend on that optional ERP setting.

## Verification

Browser fixtures contain no live financial records. Live checks use GET requests
only; they print counts/status rather than business rows or credentials.

| Check | Final result |
| --- | --- |
| Web unit/protocol suite | 266 passed; 42 database cases intentionally run in the separate integration command. |
| Disposable PostgreSQL/Redis suite | 42 passed, including migrations through 005 and index verification; containers cleaned up. |
| Production-browser suite | 94 passed across desktop and mobile, with tablet/RTL scenarios. |
| Local preview suite | 10 passed across desktop and mobile against the running development server. |
| Web compilation | `npm run typecheck`, strict unused-symbol TypeScript check and `npm run build` passed. |
| Python native bridge | 15 passed. |
| Mobile compilation | TypeScript passed; Android and iOS exports passed (approximately 1.5 MB each). |
| Backup regression | Encryption/publication/failure cleanup passed. The added disposable real PostgreSQL/pgvector and file restore passed, including receipts, audit sequence, file checksums/permissions, relationships and wrong-key rejection. Test container/tag cleanup verified. Actual off-host/operator recovery is still pending. |
| Dependencies | Web: zero reported advisories; mobile: zero moderate and 15 high transitive findings remain, described below. |
| Client artifact scan | 59 web/mobile public build files checked against four configured server secrets, including encoded variants: no matches. |
| Git whitespace check | Passed. |

An initial test run that overlapped CPU-heavy unit and browser suites hit a PDF
parser cold-start timeout and a browser login deadline. The final suites ran
separately with their existing assertions/timeouts and passed. The separate
anonymous-route timeout exposed an eager MCP import; authentication now precedes
that import and the full unit suite passes.

- Web unit/protocol regressions cover native permissions and child scope,
  pagination, Company/date/number validation, routes, OAuth, policy, evidence and
  configuration. Database tests run separately in disposable containers rather
  than being silently counted as unit coverage.
- Disposable PostgreSQL/Redis integration checks cover all five migrations,
  indexes, concurrent quotas/approvals, encryption, isolation and external MCP
  OAuth/grants. The additive migrations were also applied to the verified local
  project database; no remote ERP schema was changed.
- Production-browser scenarios cover desktop/mobile authentication, two-factor
  recovery, expiry/downtime, all main destinations, Company/period races, errors,
  exports, field forms, read-only controls, consent retry, responsive tablet RTL,
  keyboard focus and unexpected browser JavaScript errors.
- Separate localhost-preview scenarios verify anonymous preview makes no
  business-data requests and signed-in sessions use normal protected reads.
- GET-only live checks loaded all ten financial/people adapters, all six
  operational adapters and all 28 workspace module schemas/lists under the
  configured API identity. These do not prove least-privilege user acceptance.
- Mobile TypeScript and Android/iOS exports, Python bridge regressions, encrypted
  backup publication/cleanup and actual disposable database/private-file recovery
  were exercised. The recovery test runs all migrations and the production backup
  pipelines; only the Compose transport is adapted to local commands in its test
  container. It uses no host mounts/ports/socket or company configuration.

## Remaining limitations and acceptance work

Completion audit: the full production-readiness objective is **not achieved**.
The deployment and least-privilege acceptance prerequisites remain unavailable,
as confirmed by the user and the current configuration. Rechecking the package
registry still returns affected `braces` 3.0.3 and `node-forge` 1.4.0 releases.
AI configuration is optional and is not a blocker for native ERP use.

| Requirement | Current evidence | Acceptance status |
| --- | --- | --- |
| Architecture, frontend/backend, APIs, permissions and major flows | Feature coverage and finding/fix tables above; mapped native reader, web/mobile, database, MCP and bridge code reviewed. | Local audit performed; production behavior still requires live acceptance. |
| Functional logic, data integrity and security fixes | Unit/protocol, database, Python and browser checks; bounded GET-only ERP checks; secret scan and dependency inventory. | Available local fixes verified; live non-admin isolation remains unverified and mobile upstream advisories remain unresolved. |
| Responsive UI, accessibility and error/loading behavior | Desktop/mobile browser scenarios plus tablet RTL, keyboard focus, forms, expired sessions and recovery. | Local browser checks passed; physical-device acceptance remains pending. |
| Performance | Permission-scoped indexes, request-local evidence deduplication, lazy integrations and bounded ERP pagination. | Improvements verified locally; representative deployment load and real-user timings remain unmeasured. |
| Database and file recovery | All migrations, disposable integration tests, real encrypted dump/restore and integrity checks; disposable resource cleanup verified. | Local recovery passed; actual off-host keys/backups and deployment storage settings require operator validation. |
| SEO | Internal application intentionally uses no-index metadata and authenticated business pages. | Applicable local checks complete; no public marketing SEO is required. |
| Regression verification and deliverable | Passing type/unused-symbol checks, production build, suites listed above, CI coverage and this audit report. | Verified locally; fixtures are not substituted for live production acceptance. |
| Production readiness | No production origin is configured and no separate non-admin ERP test account is available. | Blocked on deployment/test-account availability and the unresolved dependency release risk; do not certify the application as production-ready. |

1. **Production acceptance is pending.** There is no production HTTPS URL or
   separate non-admin ERP test account. Native browser login is tested with
   isolated fixtures; live API checks use the existing identity. Cross-role live
   acceptance, public OAuth callbacks, off-host/key recovery, real load measurements and
   deployment/TLS/cookie checks remain deployment work.
2. **AI is optional and unconfigured.** No model/provider credentials were supplied.
   Do not add AI as a prerequisite for native reads. Redis/background knowledge
   ingestion and voice/device capture require their own configuration/testing if
   those optional features are activated later.
3. **Mobile dependency advisories remain.** The scoped uuid update removed the
   moderate findings. `npm audit` still reports 15 high transitive findings
   cascading from `braces` and `node-forge`; current advisories have no patched
   release. The proposed automated fix downgrades Expo to 44 and is incompatible
   with this app. Follow upstream updates before a mobile production release;
   exports alone do not verify installed-device behavior. See
   [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
   [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) and
   [fixed uuid advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
4. **ERP report definitions can be stale.** The existing readability audit records
   missing-field/filter problems, including `DM Facilities Rent Agreement Details`
   referencing missing `date_to`. The app rejects these reports rather than
   inventing replacements or modifying ERP configuration. A non-AI report-library
   UI has since been implemented in [the Explorer](ERP-EXPLORER.md). Remaining
   unmapped dashboard definitions and salesperson attribution are separate
   feature work; see [ERP-READABILITY-AUDIT.md](ERP-READABILITY-AUDIT.md).
5. **Read-only is intentional.** Field drafts can be saved locally; submission,
   knowledge uploads, ERP changes and messages remain disabled. Deferred write
   implementations are not evidence that write workflows are production-approved.
6. **Consistency and measurement limits.** Multi-request ERP reads are not one
   database snapshot. Stable order and duplicate/cap checks reject known unsafe
   results but cannot eliminate concurrent source edits. Physical-device SSO,
   microphone/camera/download behavior and real-user Core Web Vitals were not
   measurable in this environment. Untrusted parser resource-isolation testing
   belongs before re-enabling document uploads.

No passwords, API keys, actual financial rows or secret environment values are
included in this report. No live ERP records were created, edited or submitted.
