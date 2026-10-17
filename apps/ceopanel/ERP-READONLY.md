# Read-only ERP release

The **2026-10-17** update adds six operational dashboards, bringing the connected
total to 16. See [ERP-DASHBOARDS.md](ERP-DASHBOARDS.md) for their current definitions.
The original ten adapters below retain their calculations.

Implemented on 2026-10-15 using the inspected Frappe/ERPNext installation. Native API
field checks succeeded for all 28 record lists. All ten dashboard adapters loaded
successfully for a 30-day period under the locally configured discovery identity.
This verifies access and adapter behavior; it does not certify financial statements
or permissions for other users. The application uses each signed-in user's SID.
Dashboard scope notes identify that figures reflect records visible to that account.

## Dashboard definitions

| View                 | Data and calculation                                                                                                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sales Comparison     | Submitted Sales Invoice `base_net_total`, filtered by company and posting date. Compares the selected period with the immediately preceding equal-length period; includes negative return invoices. Change is unavailable when the prior sum is zero. |
| Quotations           | Submitted quotations dated within the selected period; net quoted value in company currency, ordered/partially ordered count and expired count.                                                                                                       |
| Sales Operations     | Submitted sales orders dated in the period; net order value, pending delivery and pending billing counts. Closed/completed orders do not count as pending.                                                                                            |
| Purchasing           | Submitted purchase orders dated in the period; company-currency net value, pending receipt and pending billing counts.                                                                                                                                |
| HR                   | Current employee status, active employees by department and employee directory. Only the joining metric uses the selected period.                                                                                                                     |
| Attendance           | Submitted attendance records dated in the period. Counts Present, Absent and On Leave separately; Half Day and Work From Home remain visible. No attendance percentage is inferred without shift/holiday sources.                                     |
| Payments/Collections | Submitted Payment Entry records in the period. Receive uses `base_received_amount`; Pay uses `base_paid_amount`. Internal transfers are excluded from both totals and remain visible in the table.                                                    |
| AR                   | Current positive submitted invoice balances, converted using each invoice's conversion rate. Aging uses due date. Credits and unallocated payments are excluded; this is not a general-ledger AR total or a historical reconstruction.                |
| Stock                | Submitted Stock Entry movements in the period: incoming/outgoing values and entry types. No current warehouse balance, stock availability or valuation is inferred.                                                                                   |
| CRM                  | Leads created and opportunities dated in the selected period. Opportunity statuses are current; no cross-currency pipeline sum is inferred.                                                                                                           |

All totals load every matching row, with a 10,000-row ceiling. A permission failure,
invalid amount, duplicate row, invalid required date, company mismatch or ceiling
overflow fails the view instead of publishing partial or zero totals. Empty successful
queries produce actual zeros. Search and CSV exports apply to the loaded result.

Remaining UI slots and integrations are independent of these definitions.
Five dashboard slots remain unconnected: Management Insights, Metabase,
Management Reports, Accounts and Sales Person.

## Existing Sales Comparison report layout

The ERP's original 14-card/six-chart layout is mapped in the discovery inventory but
is not reproduced by this first invoice-based view. Reviewed source queries use
fixed calendar periods, salesperson exclusions/static targets, and no company
predicate. Reusing those totals would misrepresent the portal's company/period
filters. No source SQL or custom report script was executed or changed. The current
view labels its invoice-based scope explicitly. Regional targets, custom exclusions
and native widget parity require a separate scoped mapping.

## Workspace lists

Connected standard records: Customers, Leads, Quotations, Sales Orders, Invoices,
Delivery Notes, Items, Employees, Attendance, Expenses, Purchase Orders, Stock Entries,
Projects, Suppliers, Purchase Invoices, Leave Applications, Bank Accounts, Bank
Transactions, Payment Entries and Journal Entries.

Additional connected lists: Opportunities, Purchase Receipts, Warehouses, Assets,
Facilities, IT Assets, Loan Applications and Delivery Trips. Standard ERPNext types
appear with the standard records; Facilities and IT Assets appear under Custom
DocTypes, matching their inspected definitions.

These workspace lists select and project only explicit scalar display fields. No arbitrary DocType,
SQL, requested field list, child-table expansion or hidden credential field is accepted.
Company-owned records use a literal company filter for lists and detail lookups.
Customers, Suppliers and Items are shared catalogs, labelled accordingly, under native
ERP visibility rather than an invented company ownership filter. Native read permission
is checked for the schema and enforced again by every record query.

The separate assistant/MCP reader now discovers native/custom business sources,
reads child tables, runs native reports, inspects workflow approvals and exports
files with explicit ERP-wide consent. Its scope and permissions are documented in
[ERP-ASSISTANT.md](ERP-ASSISTANT.md); the workspace lists retain their narrower scope.

## Write boundary and authentication

- `ERP_READ_ONLY` is a code-level policy. There is no environment switch to enable writes.
- Record dialogs mask upstream create/edit/submit/cancel grants and workflow actions.
- Workspace POST/PUT/action endpoints reject requests with HTTP 403 before dispatch.
- Service-level saves/actions and proposal reviews also reject writes.
- MCP publishes only read-effect tools. Mutation and proposal tools are unavailable.
- ERP transport blocks mutation requests and allows only known read bridge operations.
- Native dashboards and lists use GET requests and the authenticated user's session.
  The discovery API key is never a fallback for an anonymous or ordinary portal request.
- Anonymous local preview still issues no business requests. Signing in with an ERP
  account switches to the authenticated view even when local preview is enabled.

All routes return private, no-store responses. Enabling writes in a later release
requires an explicit user request, reviewed policy changes and native validation;
providing a more privileged API key does not enable them.

## Regression checks

The normal unit and browser suites exercise the real read-only policy. The isolated
PostgreSQL/MCP lifecycle suite uses test-only mocks to exercise the deferred bridge
write engine against an in-memory ERP stub; it cannot enable writes in the running
application or access live ERP records. Its PostgreSQL and Redis services are disposable.
Native API checks use GET requests only and keep credentials and financial values out
of logs. Browser scenarios cover desktop/mobile layouts, permission failures and
hostile schema responses that advertise write permissions.
