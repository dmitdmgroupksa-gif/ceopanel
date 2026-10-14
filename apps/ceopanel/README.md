# Durar Masagh CEO platform

The application retains the shadcn card, table, tab, and dark-mode design. All CEO navigation sits in a horizontally scrollable top tab bar. Scroll controls and a quick selector make every dashboard accessible on desktop and mobile. Direct links use dashboard IDs, such as `/#stock` and `/#crm`.

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

All 18 screens are ready for data setup. Each has editable metric labels, a chart slot, record columns, reporting-period controls, and refresh. Values are null, charts contain no points, and record tables contain no rows until their sources are assigned. Search and export become available when a mapped adapter returns data. **No sample financial values or assumed company calculations appear in these dashboards.**

## ERP record management

Open `/workspace` to browse the prepared modules for Customers, Leads, Quotations, Sales Orders, Invoices, Delivery Notes, Items, Employees, Attendance, Payroll, Expenses, Purchase Orders, Stock, and Projects. The workspace includes sections for custom DocTypes and custom reports, and dynamic record forms with custom fields and child tables. Create/edit and submit/cancel handlers are prepared but remain disabled until the company API is configured. See [ERP-WORKSPACE.md](ERP-WORKSPACE.md) for the adapter contract, routes, and integration requirements.

## Connecting the data later

`lib/dashboards.ts` defines the dashboard IDs, titles, editable layout labels, and the `DashboardData` contract. The labels are starting points for the layout; their exact meaning, fields, and formulas remain to be confirmed.

`lib/dashboard-server.ts` holds an initially empty `dashboardAdapters` registry. Once the company supplies a dashboard's report, query, API, or Metabase source, register an adapter under that dashboard's ID. Each adapter receives a verified ERPNext user/company context and a reporting period, and returns:

- The matching dashboard ID, selected company, currency, period, and update timestamp.
- Metric labels and values, optionally formatted as numbers, currency, or percent.
- Chart series and points.
- Record columns and rows, with stable row IDs.

`GET /api/dashboards/[dashboardId]?days=30|90|365&company=...` validates the ID and reporting period. Unmapped dashboards return `awaiting-data` without calling ERPNext, Metabase, or another external service. A registered adapter runs only after company access is verified, and results for a different dashboard/company are rejected. Responses use `private, no-store` and vary by cookie.

The UI already renders returned metrics, charts, and records, supports search/paging/CSV export, and refreshes mapped dashboards once per minute while the page is visible. Obsolete requests are canceled when changing dashboard, company, or period. Existing ERPNext REST transport, metric helpers, and record components remain available to reuse in confirmed adapters. The previous generic snapshot endpoint is retained as integration scaffolding but is not called by the new CEO screens.

When sharing the mappings, provide each dashboard's source, fields or report columns, filters, company scope, calculations, currency, date definitions, and any required actions. Keep private API credentials in the server environment rather than source files or browser props.

## ERPNext connection

Defaults are **Durar Masagh**, **https://dmgroup.frappe.cloud**, and **Asia/Riyadh**. Copy `.env.example` to `.env.local` to change them. `ERPNEXT_COMPANY` optionally sets the exact Company document to select first.

Optional ERPNext sign-in sends credentials to the company site and stores only the returned SID in an HttpOnly, SameSite cookie (Secure in production). Passwords are not saved or echoed in responses. `/api/erpnext/context` checks `frappe.auth.get_logged_user` and reads the permitted Company list; it does not fetch dashboard business records. Connecting ERPNext leaves unmapped dashboards in **Awaiting data** status.

Sign-out removes the platform cookie and clears displayed mapped data. It does not sign the user out of other ERPNext browser sessions. Standard username/password login is prepared; mandatory 2FA/SSO requires its corresponding authentication flow. Live company credentials have not been used in development tests.

## Run and validate

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

Use HTTPS when hosting. Behind a reverse proxy, configure `CEOPANEL_ORIGIN` with the public origin, without a trailing slash. The application has not been deployed or connected to live dashboard data yet.
# Enterprise platform

See [PLATFORM.md](PLATFORM.md) for implemented services, staging activation, API contracts,
channel gates and validation. Linux deployment is documented in [deploy/README.md](deploy/README.md).
