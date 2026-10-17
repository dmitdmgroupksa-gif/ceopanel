# Durar Masagh CEO platform

The application retains the shadcn card, table, tab, and dark-mode design. Eight main sections live in a collapsible desktop sidebar and a mobile navigation drawer. Department dashboards use icon tabs with animated full-name tooltips on hover and keyboard focus. Scroll controls and a quick selector keep them accessible on desktop and mobile. Direct links use dashboard IDs, such as `/#stock` and `/#crm`.

## CEO dashboards

The order follows the company screenshot. Expanded names were confirmed by the user.

1. Sales Comparison
2. Quotation Team Dashboard
3. Management Insights
4. Payments & Collections
5. HR Dashboard
6. Metabase Analytics
7. Management Reports
8. Dispatch & Logistics
9. Attendance Dashboard
10. Approvals Dashboard
11. Purchase Dashboard
12. Sales Operation
13. Task Dashboard
14. Stock Dashboard
15. Accounts Dashboard
16. AR Dashboard
17. Sales Person Dashboard
18. CRM Dashboard

Also connected: **Facilities & Renewals**, **IT Service** and **Factory Operations**.
Approvals, Dispatch & Logistics and Tasks now use native read-only adapters.
There are 17 connected views across 21 dashboard tabs. See
[ERP-DASHBOARDS.md](ERP-DASHBOARDS.md) for sources, scope and calculation rules.

Unconnected dashboards show one concise empty state. Metrics, charts, record search, and exports appear when a mapped adapter returns data. Reporting-period and company filters remain available. **No sample financial values or assumed company calculations appear in these dashboards.**

The first read-only release connects Sales Comparison, Quotations, Sales Operations,
Purchasing, HR, Attendance, Payments/Collections, AR, Stock Movements and CRM through
native Frappe reads. These adapters require the signed-in user's ERP session and do
not require the custom bridge or platform database. All ten adapters and the field
allowlists for 28 workspace lists were checked with live read-only API requests.
See [ERP-READONLY.md](ERP-READONLY.md) for calculation definitions and limitations.

Internal AI and external MCP also share an ERP-wide read-only toolset for custom
DocTypes, reports, approval-state inspection and PDF/CSV/XLSX delivery. See
[ERP-ASSISTANT.md](ERP-ASSISTANT.md) for setup, external consent and client limits.

The workspace now exposes that native reader directly at `/workspace#explorer`:
source discovery, report filters/results, custom record details, workflow inspection
and downloads work without AI. `/workspace#briefing` combines six live operational
sources with explicit scope, period and error handling. See
[ERP-EXPLORER.md](ERP-EXPLORER.md) for behavior, permissions and verification.

The local `ERP-READABILITY-AUDIT.md` covers custom DocTypes, report definitions
and access limits. Private ERP discovery/readability inventories are deliberately
excluded from the public repository. See [EC2 deployment](deploy/AWS-EC2.md) for
the complete `panel.durar.ai` setup commands.

The application is code-first: dashboards, record searches, exports and approval
inspection use deterministic ERP API reads. No AI model, Redis worker or platform
database is required for these native views. AI assistants and voice are optional;
they remain unavailable until their server configuration and data permissions are
approved. ERP creation, editing, submission and workflow execution remain disabled.
See [APPLICATION-AUDIT.md](APPLICATION-AUDIT.md) for the latest audit and validation.

## ERP record management

Open `/workspace` to browse the connected read-only lists and record details. Company-owned records are filtered by the selected company; Customers, Suppliers and Items are explicitly identified as shared ERP catalogs under the user's native permissions. Payroll, native Tasks and Communications remain unconnected. Creation, editing, submission, cancellation and workflow execution are disabled at the interface, HTTP, service and ERP transport boundaries, even when ERP grants those permissions. No environment variable enables writes in this release. See [ERP-WORKSPACE.md](ERP-WORKSPACE.md) for the adapter contracts.

## Connecting the data later

`lib/dashboards.ts` defines the dashboard IDs, titles, editable layout labels, and the `DashboardData` contract. The labels are starting points for the layout; their exact meaning, fields, and formulas remain to be confirmed.

`lib/dashboard-server.ts` registers ten native financial/people adapters and six
operational adapters. Additional validated report mappings can populate the
remaining dashboard slots. Each adapter receives a verified ERPNext user/company
context and a reporting period, and returns:

- The matching dashboard ID, selected company, currency, period, and update timestamp.
- Metric labels and values, optionally formatted as numbers, currency, or percent.
- Chart series and points.
- Record columns and rows, with stable row IDs.

`GET /api/dashboards/[dashboardId]?days=30|90|365&company=...` validates the ID and reporting period. Unmapped dashboards return `awaiting-data` without calling ERPNext, Metabase, or another external service. A registered adapter runs only after company access is verified, and results for a different dashboard/company are rejected. Responses use `private, no-store` and vary by cookie.

The UI already renders returned metrics, charts, and records, supports search/paging/CSV export, and refreshes mapped dashboards once per minute while the page is visible. Obsolete requests are canceled when changing dashboard, company, or period. Existing ERPNext REST transport, metric helpers, and record components remain available to reuse in confirmed adapters. The previous generic snapshot endpoint is retained as integration scaffolding but is not called by the new CEO screens.

When sharing the mappings, provide each dashboard's source, fields or report columns, filters, company scope, calculations, currency, date definitions, and any required actions. Keep private API credentials in the server environment rather than source files or browser props.

## ERPNext connection

Defaults are **Durar Masagh**, **https://dmgroup.frappe.cloud**, and **Asia/Riyadh**. Copy `.env.example` to `.env.local` to change them. `ERPNEXT_COMPANY` optionally sets the exact Company document to select first.

Company pages require sign-in at `/login`. Native ERPNext sign-in sends credentials to the company site, verifies the returned SID, and stores it in an HttpOnly, SameSite cookie (Secure in production). Passwords are not saved or echoed in responses. Native Frappe v14 email, SMS, and authenticator challenges are supported; first-time authenticator enrollment follows the instructions emailed by ERPNext. `/api/erpnext/context` verifies identity and permitted companies before mounting company views. Native record and role permissions are enforced again by server APIs. Connecting ERPNext leaves unmapped dashboards in **Awaiting data** status.

Sign-out revokes the current ERPNext session and clears local credentials and company views. Other ERPNext sessions are unaffected. If ERPNext is unreachable, local logout succeeds and the login page explains that remote revocation remains incomplete. Session expiry redirects to sign-in with a validated local return path. Browser authentication tests use fixtures; controlled native API checks use local server credentials for reads only, without printing them or financial values. See [AUTH.md](AUTH.md) for behavior, validation, and the GitHub and animation references used.

Native Frappe authorization-code login is also supported for the panel and external
MCP. Register a Frappe OAuth Client using [the setup guide](deploy/FRAPPE-OAUTH.md)
to enable it. Personal tokens stay encrypted on the server. Each MCP request
rechecks that user's identity, roles and accessible companies, and each data read
uses native Frappe permissions. Integrations shows only the current user's MCP
connections. Inaccessible dashboards are hidden and direct links show **No access**.

## Run and validate

For local interface testing without sign-in, set `CEOPANEL_DISABLE_AUTH=true` in `.env.development.local` and run `next dev`. Set it to `false` and restart to require sign-in again. This switch only works on loopback hosts in development; production and all ERP APIs still require normal authentication. `/login` remains available to review the login screen. See [AUTH.md](AUTH.md#local-interface-testing) for the preview tests and scope.

From the repository root:

```sh
npm run ceo:install
npm run dev
npm run ceo:typecheck
npm run ceo:test
npm run ceo:test:browser
npm run build
npm start
```

Open **http://localhost:3000**. The focused app has its own npm lockfile. Browser tests use Edge on Windows and Playwright Chromium on other systems (`npx playwright install chromium`). Tests cover all tabs, responsive layout, deep links, source readiness, ERPNext context, and a mocked future adapter's rendering/search/export behavior. Integration tests verify that unmapped dashboards make no external requests, adapter results stay within the selected company, and existing transport/session protections continue to work.

`npm start` launches the generated standalone server, prepares its static/public assets,
and loads production environment files from the app directory. Set `PORT`/`HOSTNAME` to
override the listener. Private configuration and document paths retain the same app-relative
locations used by the worker.

Use HTTPS when hosting. Behind a reverse proxy, configure `CEOPANEL_ORIGIN` with the public origin, without a trailing slash. The application has not been deployed or connected to live dashboard data yet.

# Enterprise platform

See [PLATFORM.md](PLATFORM.md) for implemented services, staging activation, API contracts,
channel gates and validation. Linux deployment is documented in [deploy/README.md](deploy/README.md).

Follow [STAGING.md](STAGING.md) to prepare private configuration, obtain ERP metadata,
generate disabled mapping drafts, reconcile a pilot and validate approvals before rollout.
From the repository root, `npm run ceo:setup` prepares missing local files and
`npm run ceo:check -- --connections --phase=foundation` reports infrastructure prerequisites.
`npm run ceo:test:integration` runs migrations, probes and approval/MCP regressions against
disposable Docker PostgreSQL/pgvector and Redis services without using company credentials.
