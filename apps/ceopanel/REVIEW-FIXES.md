# Review fixes — 2026-10-17

Follow-up: the broader [application audit](APPLICATION-AUDIT.md) adds native
field-permission enforcement, API/UI fixes, query indexes and mobile verification.
It supersedes the verification counts below. Docker became available, and all 42
database integration checks now pass; migrations through 005 were applied to the
verified local project database only.

Review of the operational dashboards, ERP reader/report boundaries, refresh and
session handling, record links, and spreadsheet exports.

| Finding                                                                                                                                             | Fix                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saved Report Builder child columns could remain selectable when their parent Table field was restricted.                                            | Compile child fields only through readable parent table connections. Reject a shared child DocType if any parent table using it is restricted; Frappe v14's native child join does not isolate by parentfield. Restrict child-schema discovery too. Roles with the required permission level retain access. |
| Arabic custom fields were omitted from saved report columns and rejected as filters.                                                                | Permit Unicode letters, marks and digits in validated identifiers while retaining metadata allowlists and SQL punctuation restrictions.                                                                                                                                                                     |
| Report filters used a normal object, so inherited properties could satisfy a required filter and special property names could change its prototype. | Build the filter dictionary without an object prototype.                                                                                                                                                                                                                                                    |
| Editing records could shift modification-sorted pages during a full dashboard read.                                                                 | Request records in stable name order. Duplicate and truncation checks remain enforced.                                                                                                                                                                                                                      |
| SQL `status != 'Cancelled'` omitted tasks with NULL status.                                                                                         | Exclude cancelled tasks after reading, preserving unknown statuses in the register. Fixtures now model SQL NULL behavior.                                                                                                                                                                                   |
| A trip with no recorded status could contribute to an overdue count.                                                                                | Count past-scheduled-date trips only when their status is Scheduled or In Transit.                                                                                                                                                                                                                          |
| Boolean rent payment flags did not match numeric checkbox handling.                                                                                 | Treat true/1/"1" as paid and false/0/"0" as recorded unpaid; keep unknown flags separate.                                                                                                                                                                                                                   |
| Some date checks accepted impossible dates or malformed timestamp suffixes.                                                                         | Validate real calendar days and complete supported timestamps, preserving the ERP's local calendar day. Apply the same check to operational dates and financial posting/aging dates.                                                                                                                        |
| A changed reporting period could temporarily display/export the previous period's records.                                                          | Bind loaded data to dashboard, account, company and period. Hide old records immediately when those inputs change; reset pagination for new periods.                                                                                                                                                        |
| Failed refreshes could retain previously readable dashboard/workspace rows.                                                                         | Clear records, metrics, export availability and workspace details when the current read fails. Invalidate pending detail operations.                                                                                                                                                                        |
| An older Company context response could override a later choice.                                                                                    | Abort earlier context requests and check request identity before updating context. Ignore aborted session verification responses before handling an expired session.                                                                                                                                        |
| Source links accepted unrelated websites if their paths began with /app/.                                                                           | Require the configured ERP origin, HTTP(S), an /app/ path and no embedded credentials.                                                                                                                                                                                                                      |
| Dashboard CSV handling missed formulas after whitespace and turned numeric credits into text.                                                       | Share formula neutralization with ERP exports, protect whitespace-prefixed formulas and preserve actual numeric negatives. Include the active search in dashboard CSV metadata.                                                                                                                             |

## Practical limits

ERP reads are live API reads, not a database transaction. Stable ordering reduces
page drift from edits; concurrent insertions, deletions or permission changes can
still affect a multi-request read. Duplicate/truncation detection rejects known
incomplete results. Approval roles remain candidates, not approval authorization.

ERP creation, editing, submission and workflow execution remain disabled. Live
verification uses GET requests and prints only counts/status, never business rows
or credentials. Browser tests use isolated API fixtures.

The GET-only saved-report check loaded Daily Sales Invoice Report-FA and DM
Facilities Report. DM Facilities Rent Agreement Details remains blocked because
its saved configuration references the missing `date_to` field, as recorded in
[the ERP audit](ERP-READABILITY-AUDIT.md). This needs correction in ERP report
configuration; the application does not guess a replacement or change the ERP.

The shared-child restriction follows the native
[Frappe v14 query implementation](https://github.com/frappe/frappe/blob/version-14/frappe/model/db_query.py).

## Verification

- TypeScript checking and the final production build passed.
- All 238 unit/protocol tests passed.
- All 84 production-browser desktop/mobile checks passed, including read failures,
  delayed period responses, rapid Company changes and unsafe links.
- All 10 local-preview desktop/mobile checks passed, including authenticated reads
  and the anonymous UI's lack of business-data requests.
- GET-only checks loaded all six operational dashboards using the configured API
  identity. Saved-report checks are described above.
- A scan of 55 final client JavaScript/source-map files found no literal matches
  for the configured ERP API key or secret.
- Database integration testing was attempted but could not start because Docker's
  Linux engine was unavailable. The 41 database tests remain unverified this turn;
  no test containers or database changes were created by the failed startup.
