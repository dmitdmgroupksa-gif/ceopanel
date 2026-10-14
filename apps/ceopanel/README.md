# Durar Masagh CEO platform

The runnable application lives here. Navigation consists entirely of top tabs, including on mobile. Its cards, tables, dialogs, neutral colors, and dark mode use the original shadcn design.

## Configuration and sign-in

The defaults are **Durar Masagh**, **https://dmgroup.frappe.cloud**, and **Asia/Riyadh**. Copy `.env.example` to `.env.local` if these need changing. `ERPNEXT_COMPANY` optionally specifies the exact Company document name to select first. Without it, the first permitted company is selected; users can switch between companies they are allowed to read.

There are no shared API keys. Each user connects with their own ERPNext username and password. The Next.js server sends credentials directly to `/api/method/login`, captures the returned session, and stores only its SID in an HttpOnly, SameSite cookie (Secure in production). Passwords and session IDs are not returned in company snapshot JSON, saved in environment files, or written to application logs. The application validates the user through `frappe.auth.get_logged_user` before reading any business records.

Sign-out removes the platform session cookie and clears displayed company data. It does not sign the user out of other ERPNext browser sessions. This adapter supports standard username/password sign-in; company deployments using mandatory 2FA or SSO need the corresponding authentication flow before connection can be used. No live company credentials were used during implementation or tests.

## Prepared ERPNext data sources

| Tab        | ERPNext DocTypes                                                | Scope                                                                                                                |
| ---------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Overview   | Sales Invoice, Purchase Invoice, Sales Order, Project, Employee | Billing, outstanding balances, open work, and active employees                                                       |
| Finance    | Sales Invoice, Purchase Invoice                                 | Submitted billing within the selected period; outstanding invoices across all dates                                  |
| Sales      | Sales Order, Sales Invoice                                      | Submitted open orders across all dates; submitted invoices within the selected period                                |
| Purchasing | Purchase Order, Purchase Invoice                                | Submitted open orders across all dates; submitted invoices within the selected period; outstanding supplier invoices |
| Projects   | Project                                                         | Company projects, status, priority, target date, and completion                                                      |
| People     | Employee                                                        | Active employees, departments, roles, and join dates                                                                 |
| Reports    | Sales Invoice, Purchase Invoice                                 | Monthly billing report and CSV export                                                                                |

Every business query includes the selected Company filter. The Company list itself comes from the signed-in user's permitted ERPNext records. Read permissions continue to be enforced by ERPNext; the app does not elevate access. If Frappe HR is absent or a user lacks employee permissions, the People source is unavailable while other sources can still load.

Financial values use the Company's default currency. Billing uses `base_net_total`, excluding tax, and includes negative returns. Outstanding balances are invoice `outstanding_amount × conversion_rate`; credit balances are included. Overdue counts include positive outstanding invoices with a due date before the current business date. These metrics describe **billing and outstanding invoices**, not profit, cash flow, or bank balances. Those require General Ledger/accounting reports and company-specific mappings.

The reporting period controls billing metrics and charts. Open orders, outstanding invoices, projects, and active employees retain their explicitly labeled all-date scopes. Monthly rows include only dates inside the selected period, so the first and last months may be partial. Dates follow `BUSINESS_TIMEZONE`.

## Refresh behavior and errors

Data is fetched through `/api/erpnext/snapshot` with `Cache-Control: private, no-store` and `Vary: Cookie`. There is no shared snapshot cache or database. The active visible page polls every 60 seconds; Refresh fetches immediately. Company and period changes cancel obsolete browser requests so older responses cannot replace the latest selection.

The REST client follows every page in batches of 200. If a source exceeds 10,000 records, it returns an explicit error instead of showing truncated totals. Choose a shorter period or replace that source with a server-side ERPNext report for larger workloads. Pagination is not a transactional database snapshot; records changed during a multi-page fetch may be reflected in the next refresh.

Source failures show **Unavailable**, not zero. A failed subsequent refresh retains the last successful snapshot with its company, period, and an error notice. It never substitutes demo data for live failures. Without a signed-in session the platform shows clearly labeled preview data, and preview CSV filenames start with `PREVIEW-`.

## Extending synchronization

`lib/erpnext-server.ts` owns the company-scoped source registry. Add DocTypes and field mappings there, then extend `lib/model.ts` and the corresponding tab. Custom fields and workflows must be checked against the actual company installation.

This first version prepares **read synchronization** for the mapped company records. ERPNext remains the source of record; record links open ERPNext for editing. It does not yet mirror every ERPNext DocType, write changes back, or run background/webhook synchronization. Future write actions should use the signed-in user's permissions, validate company ownership, enforce same-origin/CSRF protection, and handle ERPNext document workflows rather than updating raw financial totals.

For background synchronization, introduce a permission-scoped service account, a durable queue/database, signed webhook validation, idempotent processing, and reconciliation before enabling writes. For profit, cash/bank, stock, payroll, and custom approvals, use the corresponding ERPNext reports/DocTypes rather than inferred billing metrics.

The transport follows the official [Frappe REST API](https://docs.frappe.io/framework/user/en/api/rest), including its session authentication, fields, filters, and pagination conventions.

## Development and validation

From this directory:

```sh
npm install --workspaces=false
npm run dev
npm run typecheck
npm test
npm run test:browser
npm run build
npm start
```

The browser tests use Microsoft Edge on Windows. On Linux/macOS install Playwright Chromium with `npx playwright install chromium`. Tests mock ERPNext and cover desktop/mobile tabs, period selection, search, sorting, paging, exports, authentication failures, company selection, unavailable modules, stale snapshots, and sign-out. Integration tests cover credentials, origin checks, pagination, company filters, and financial calculations.

Use HTTPS for hosted production deployments. Install/build this app directory, provide server environment variables, and restrict access according to company policy. Behind a reverse proxy, set `CEOPANEL_ORIGIN` to the public origin (for example `https://ceo.your-company.com`, without a trailing slash) so sign-in origin validation uses the browser-facing URL. The preview is illustrative; live access requires ERPNext sign-in. The app has not been deployed or connected to live company records yet.
