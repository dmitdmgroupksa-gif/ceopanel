# Operational dashboards

Implemented and checked against the configured ERP API account on 2026-10-17.
There are now **16 connected dashboards**: the original ten plus these six.
Three fill existing slots; Facilities & Renewals, IT Service and Factory Operations
are new dashboard tabs. The eight main navigation destinations are unchanged.

| View                  | Source                                                  | Scope and period                                                   | Definition                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approvals             | Active Workflow definitions and readable document types | ERP account; requests created in selected period, default 30 days  | Requests whose current state has outgoing transitions. Candidate roles, conditional steps, draft/submitted counts and readable workflow types.                                                                                        |
| Dispatch & Logistics  | Delivery Trip and its effective custom fields           | Selected Company; scheduled date in selected period                | Submitted trips, completed trips, In Transit trips and Scheduled/In Transit trips past their scheduled date. Unrecorded statuses are visible but do not imply an overdue trip.                                                        |
| Task Dashboard        | Custom Tasks, not standard Task                         | ERP account; current register                                      | Open statuses: Pending, In Progress, Under Review and On hold. Overdue, unassigned and missing-date open tasks. Completed and unrecorded statuses remain visible; cancelled records are excluded.                                     |
| Facilities & Renewals | DM Facilities Management                                | Selected Company; expired dates plus upcoming 30/90/365-day window | Facilities excluding cancelled records and Closed contracts. Agreement, lease, registration, license, civil-defense, fire, industrial, environmental and national-address deadlines; four rent installments with recorded paid flags. |
| IT Service            | IT Help Desk Request                                    | ERP account; current register                                      | Open statuses: In Progress, In Review and Not Resolved. High/Critical open tickets, unassigned tickets and due dates before today. Assignment/due fields are requested only when readable.                                            |
| Factory Operations    | Factory Job Order                                       | ERP account; current register                                      | Open/Assigned/Inprogress jobs, completed jobs, open jobs past their end date and missing end dates. Branch/type/date drilldowns without an assumed cost currency.                                                                     |

Account-scoped views label their scope and hide the Company picker. Their sources
do not have a validated Company relationship. They use each signed-in user's ERP
permissions; the discovery API token is never a browser fallback. Current-register
views hide historical filters and show an as-of date. Facilities uses future dates
and preserves expired deadlines when the window changes.

The primary Approvals destination now opens the native workflow dashboard.
Candidate roles are **not named approvers or actions available to the current user**.
Transitions may include edits, rejection or cancellation. Older requests are outside
the selected creation period. Detailed native AI workflow inspection remains
available for current-user and condition checks; no transition is executed.

Every view has searchable, paginated records, CSV export and source ERP links.
Exports include scope and calculation notes. Status distributions use bar charts;
existing financial time series retain area charts. New controls and scope notes
have Arabic translations.

## Limits and missing data

- Effective metadata and role permission levels are checked before field reads.
  Restricted IT assignment/due metrics are unavailable rather than zero.
- Matching records are loaded completely. Missing/duplicate identities, malformed
  dates, missing required fields, cross-company rows and results over 10,000
  records reject a view. Approvals also caps its combined request set.
- Read-denied workflow types are excluded under native permissions. A failure
  reading a permitted source rejects the view rather than publishing partial totals.
- Permissions are cached only during the current request. Workflow sources use at
  most three concurrent readers. Ready views refresh while visible: five minutes
  for approvals and one minute for the others. Manual refresh is available.
- Facility dates do not certify compliance. Paid flags are not reconciled rent
  balances. Missing dates are not counted as expired. Delivery status is recorded
  ERP status, not a customer confirmation. IT dates use calendar days, not an SLA.
- The [report Explorer](ERP-EXPLORER.md) now provides native report filters,
  results and downloads directly. Financial statement reconciliation, Metabase
  and salesperson attribution remain separate work. See the [audit](ERP-READABILITY-AUDIT.md).

## Validation

GET-only live checks loaded all six adapters using the configured API identity.
An initial unlimited historical workflow check exceeded the safety cap; the shipped
view uses a visible creation-period filter and defaults to 30 days. No business
rows or credentials were printed or saved by the smoke check. Create/edit/submit,
workflow transitions and outbound messages remain disabled.

Automated coverage checks Company isolation, field permissions, unknown statuses,
paid/unknown flags, date boundaries, duplicates, result limits, conditional workflow
metadata and denied types. Browser coverage checks future filters, account scope,
safe links, CSV export and the Approvals destination on desktop and mobile.

The broader audit passed the production build, 266 unit/protocol tests, 42 database
integration checks and 94 production-browser checks. Browser tests use isolated API
fixtures; the separate live smoke check uses GET-only ERP requests. Preview tests
run serially to avoid competing development-server route compilations.

Current verification and remaining ERP report/deployment/mobile limitations are
documented in [APPLICATION-AUDIT.md](APPLICATION-AUDIT.md). The preceding focused
review is preserved in [REVIEW-FIXES.md](REVIEW-FIXES.md).
