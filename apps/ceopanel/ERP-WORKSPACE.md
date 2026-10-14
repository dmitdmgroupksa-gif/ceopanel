# Company ERP workspace

Open `/workspace` or use the ERP workspace button beside the CEO dashboard controls. The 18 CEO dashboard tabs remain available at `/`.

## Prepared record modules

| Workspace module | Initial ERPNext DocType |
| ---------------- | ----------------------- |
| Customers        | Customer                |
| Leads            | Lead                    |
| Quotations       | Quotation               |
| Sales Orders     | Sales Order             |
| Invoices         | Sales Invoice           |
| Delivery Notes   | Delivery Note           |
| Items            | Item                    |
| Employees        | Employee                |
| Attendance       | Attendance              |
| Payroll          | Payroll Entry           |
| Expenses         | Expense Claim           |
| Purchase Orders  | Purchase Order          |
| Stock            | Stock Entry             |
| Projects         | Project                 |

These are initial module registrations, not confirmed live API mappings. Additional modules such as Purchase Invoice, Salary Slip, Stock Reconciliation, or company-specific DocTypes can be registered with the same editor and record routes.

## What is ready

- Record browsing, search, and page navigation.
- A form renderer for text, numbers, dates, selects, checks, linked-record references, long text, custom fields, and child tables.
- Creating records and editing existing records.
- Submit and cancel controls for submittable documents, with a separate review step.
- Per-user action visibility and field editability, including allow-on-submit fields.
- Custom DocType registration and custom report filters/results/CSV export.

All adapters are initially unconfigured, so the UI displays **Awaiting API setup**, New Record is disabled, and no record mutations are sent to ERPNext. Tests use mocks rather than company records. ERPNext sign-in alone does not activate record actions.

## API adapter contract

`lib/workspace.ts` defines the module, field, record, permission, and report data formats. `lib/workspace-server.ts` contains:

- `workspaceAdapters`: one adapter for each confirmed module.
- `customModules`: additional DocType definitions, with `custom: true` for the custom section.
- `customReports` and `reportAdapters`: approved report names, filters, and execution handlers.

A workspace adapter provides `schema`, `list`, and `get`, and optionally `create`, `update`, and `action`. The schema is user-specific: it must expose only permitted fields and actions. It may include custom fields, child-table fields, select options, a Company field, and submission capability. It must be built from the actual company installation rather than generic field assumptions.

Adapters receive a context verified through the signed-in ERPNext user and permitted Company list. Company-scoped modules must declare `companyField`; the gateway checks returned records against it and forces that company on saves. Global masters such as Customer and Item may have no Company field and must continue to use ERPNext's own user permissions. The gateway does not invent a `company` filter for every DocType.

Writes accept only the schema's writable fields. Owner, DocType, document status, modification timestamps, permission bypass flags, and unknown fields cannot be submitted as ordinary form fields. Document status changes go through submit/cancel actions. Saves and actions require the record's last modification timestamp, and the adapter must enforce that timestamp atomically in ERPNext to close the gap between reading and writing. Cancelled documents are not editable; submitted documents accept only fields explicitly allowed on submit.

Adapters must use the same authenticated user's permissions. Do not replace a limited user's session with a shared administrator API key. The supplied API's authentication mode, field-level permissions, CSRF handling, and endpoint version must be verified before registering a write adapter. Never disable ERPNext CSRF or workflow validation to enable this UI.

For child tables, an adapter must preserve existing row identity and parent ownership when translating the form DTO to ERPNext. For complex link fields, provide permitted reference options or a company-scoped lookup adapter during integration; the prepared form currently accepts linked-record references as text.

## Routes

| Route                                                      | Method    | Behavior                                                   |
| ---------------------------------------------------------- | --------- | ---------------------------------------------------------- |
| `/api/workspace/modules/[moduleId]`                        | GET       | User-specific schema, or an unconfigured module descriptor |
| `/api/workspace/modules/[moduleId]/records`                | GET       | Search and page through records                            |
| `/api/workspace/modules/[moduleId]/records`                | POST      | Create a record                                            |
| `/api/workspace/modules/[moduleId]/records/[name]`         | GET / PUT | Read or edit a record                                      |
| `/api/workspace/modules/[moduleId]/records/[name]/actions` | POST      | Submit or cancel through a registered adapter              |
| `/api/workspace/reports/[reportId]`                        | POST      | Run an approved custom report with validated filters       |

All responses are private and uncached. Mutating requests must originate from this application. Routes do not accept arbitrary DocType names, Python method paths, SQL, or report identifiers from the browser. Custom types/reports must first be registered on the server.

## Integration details to supply

When the company is ready to connect, provide the Frappe/ERPNext version, API authentication mode, exact custom DocType names, report names and filters, permissions, company scoping, custom field definitions, and required workflows. Store private API credentials in the server environment rather than Git or browser code.

Payroll processing, salary-slip generation, payment posting, stock reconciliation, and custom approvals can require extra controller methods or workflows beyond CRUD and submit/cancel. Those company-specific actions will be wired when their actual API contracts are available. The current payroll/stock modules prepare document management; they do not claim that those full processes are active.

Reference: official [Frappe REST API](https://docs.frappe.io/framework/user/en/api/rest), [document lifecycle API](https://docs.frappe.io/framework-git/rest-api/creating-updating), and [permission model](https://docs.frappe.io/framework-git/security/permission-model).
