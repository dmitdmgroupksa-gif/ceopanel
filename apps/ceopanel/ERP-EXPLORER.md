# ERP Explorer, workflow inspection and daily briefing

Open `/workspace#explorer` or `/workspace#briefing`. These are subviews of the
existing ERP workspace; the eight main navigation destinations are unchanged.
All displayed business data comes from authenticated native ERP reads. No AI
model, platform database or Redis worker is required by these views.

## Explorer

- Search enabled reports and standard/custom business DocTypes by source name,
  module and reference type. Discovery pages contain 20 candidates; metadata
  discovery is not proof of report execution access. Native permissions are
  checked on opening and again on actual reads.
- Inspect the effective readable schema, choose columns, search records, and use
  structured field/operator/value filters. Lists contain 20 records per page and
  do not claim complete financial totals. Missing/duplicate identities fail.
- A readable native `company` Link defaults to the selected Company filter; users
  can remove it to inspect their permitted account scope. Results under an exact
  Company filter are verified against that value. Types without a validated
  Company field remain explicitly account-scoped.
- Open full permitted record details, including readable child tables. All values
  render as text; report HTML is not executed. Native system/source links open ERP.
- Open reports with their discovered required filters, optional filter controls,
  native Select values, numeric/check/date and multi-value inputs. Report Builder
  saved filters are retained. Query/Script Javascript defaults are not evaluated.
  Reports can span companies or ignore requested filters, so scope warnings remain
  visible. Invalid ERP definitions and missing required filters produce real errors.
- Display complete returned reports with local table paging. Native total rows
  remain identified as ERP totals and are not added a second time. Changing a
  filter invalidates the displayed results and their export controls.
- Download report CSV/XLSX/PDF, document PDFs and supported existing attachments.
  Every download rechecks permissions and reruns the report where applicable;
  exports may reflect ERP edits after the displayed read. PDF is limited to 500
  report rows and the existing layout/text limits; delivery is capped at 6 MB.
  Missing print/export rights or unsupported formats return an error.
- Save source shortcuts and recent sources in browser storage, scoped to ERP
  site, account and Company. Only source kind/name are stored, not business rows,
  documents, filters, tokens or credentials. Opening a shortcut rechecks access.

The same broad business-reader approval used by existing MCP reading applies:
`ERP_AI_READ_ENABLED=true` and an allowed native role in `ERP_AI_READ_ROLES`
(default `System Manager`). The historical environment names do not make a model
mandatory. Native ERP row, field, child-parent and report permissions still apply.
Security/settings sources, credential fields and standalone child tables stay
excluded. The discovery API key is never used as a browser authentication fallback.

## Workflow inspector

From a record, choose **Inspect workflow**. It displays the actual recorded state,
immediate candidate actions/roles, ERP-evaluated transitions currently permitted
for the user, and reachable future branches. Conditional branches stay marked.
Roles are not named assigned approvers; a terminal-looking state is not proof of
all operational approvals being complete. No transition can be executed here.

Inspection uses Frappe's native `get_transitions`, which reloads the document from
the database. Self-approval filtering follows the native Administrator exception;
ordinary record owners retain the native self-approval restriction. Returned
transitions from a changed state reject inspection rather than displaying an
inconsistent path. Source behavior was checked against
[Frappe v14.100.0 workflow code](https://github.com/frappe/frappe/blob/v14.100.0/frappe/model/workflow.py).

## Daily briefing

Six existing validated adapters supply live cards: receivables, workflow requests,
dispatch, custom tasks, IT service and facilities. The briefing uses those exact
calculation rules, including complete-result checks. It adds no AI summaries,
invented urgency score or cross-source financial totals.

Each card identifies its source, Company/account scope and actual time window.
Current-register adapters use today's date; dispatch and workflow creation windows
use 30 days; facilities includes expired deadlines and the next 30-day window.
Receivables remain outstanding balances as of today, not a 30-day invoice total.
Only two sources run concurrently. Explicit dashboard role mappings are enforced.
Source failures and restricted/null metrics remain unavailable, never zero.
Session expiry rejects the whole response and invokes normal session recovery.

Manual refresh clears previous data first. Sources are rechecked when the view is
opened, not preloaded from every page. Each successful card links to its source
dashboard; the note explains coverage limits, including requests outside the
workflow creation window and account-scoped custom records.

## HTTP and verification

`POST /api/erp/explorer` carries read criteria in the body to keep them out of URL
logs. Fixed actions are `sources`, `schema`, `records`, `document`, `report`,
`run-report`, `workflow`, `attachments` and `export`; no arbitrary method or write
action is accepted. Origin/body-size checks, native session/Company verification,
strict request schemas and private/no-store responses protect the boundary.
`GET /api/erp/brief` verifies the native identity and dispatches the six adapters.

Automated checks cover typed reads, permissions, scope/identity validation,
denied-source handling, concurrency, native workflow semantics, required filters,
Arabic values, downloads, stale source responses, multi-line filters and Company
switching. Browser fixtures are synthetic and are never used as application data.

Feature verification passed: 292 unit/protocol tests, all 108 desktop/mobile
browser tests, 10 localhost preview tests, TypeScript and unused-symbol checks,
and the production build. Anonymous preview tours confirmed that the new views
issue no business-data requests until sign-in.
The final public-client scan checked 63 built files against four configured
server secrets and their encoded forms; no matches were found. Database schema
and mobile packages were unchanged by this feature work; their earlier audit
checks were not rerun.

Controlled live checks used GET requests only: source discovery, 122 effective
facility fields and 19 Company-filtered records, permitted quotation details and
workflow/attachment metadata, a two-row native Stock Balance report, and all six
briefing sources passed. The check made 203 GET requests, logged counts/status
only, and did not persist business values or credentials.

ERP create/edit/submit/cancel, workflow execution and outbound messages remain
disabled. Production deployment and live acceptance with a separate non-admin
account remain the independent release gates recorded in the application audit.
