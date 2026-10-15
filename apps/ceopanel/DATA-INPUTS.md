# ERP-first data inputs and Saudi banking

ERPNext is the primary source for employees, customers, suppliers, field work, communications,
financial records and document references. These records use the existing native permission,
company scope, MCP and human-approval boundaries. There is no separate editable copy of the
company's accounting records in the CEO Panel.

The workspace now includes 23 prepared record types, including Supplier, Purchase Invoice,
Leave Application, Task, Communication, Bank Account, Bank Transaction, Payment Entry and
Journal Entry. These are catalog entries, not installed or validated company mappings. Leave
and payroll availability depends on the installed ERPNext/Frappe HR applications and versions.

`platform.config.example.json` declares candidate modules for all eight agent profiles with
reads/writes disabled. Additional candidates, including File, Contract, Employee Checkin,
Supplier Quotation, Purchase Receipt and custom site-update DocTypes, are listed in
`lib/platform/input-catalog.ts`. Discover them in staging before registering actual adapters.
Company scope for shared masters and parent-linked files must be verified separately.

## Prepare each ERP input

1. Discover actual DocTypes, fields, child tables and reports from staging. Populate the blank
   `fields`, exact company field where applicable, role mappings and approved AI fields.
   Empty schemas are deliberate; no company-specific field names are assumed.
2. Add the matching private configuration to the native Frappe bridge. Start with read-only
   permission tests for the actual company, CEO and department accounts.
3. Use approved report mappings for financial totals and reconciliation. Confirm matching
   periods, currencies and filters. Record-list pages are not a source of complete totals.
4. Enable writes, field forms and workflows individually after native validation and proposal
   approval tests. Existing ERP records remain the source for downstream channels.
5. Configure approved document collections. ERP attachment ingestion still needs native File
   and parent-document permissions, version tracking and collection mapping. Web uploads
   already work with configured collections. This change does not automatically copy every
   ERP file, email attachment, or field photo into another system.

The integration page shows the seven input categories and mapping counts. The `input_readiness`
MCP tool is a configuration inventory; it does not claim a successful live connection or
reconciliation. Custom inputs use the same explicitly mapped record/report interfaces.

## Saudi banking paths

Prefer existing bank records in ERPNext. ERPNext's documented banking flow uses Bank/Bank
Account masters, imported or synchronized Bank Transactions, accounting payments/journals,
and reconciliation. See [ERPNext banking](https://docs.frappe.io/erpnext/banking-in-erpnext).
Bank statements should continue through the verified ERP import/reconciliation process.
No new statement-file importer or automatic bank posting is enabled in this panel.

The sample `saudi-banking-erp` external source groups four verified ERP modules behind the
`external_read` MCP tool. Its reads use the signed-in user's current native ERP permissions.
Results explicitly identify partial pages; totals still come from verified ERP reports.
The `external_sources` MCP tool lists only permitted source configuration.

For a future direct bank/corporate API or open-banking provider, the optional
`saudi-bank-provider` declaration remains disabled. A bank/provider-specific implementation
must be registered in `externalAdapters` and pass staging checks. Provider credentials and
certificates stay server-side; the MCP client's token does not authorize bank account access.
Provider consent and bank authorization are separate from MCP consent.

`saudiBankAdapter` supplies the typed read boundary for such implementations:

- Company/provider binding, authorization expiry and explicit read permissions.
- Account, balance-type, currency, transaction date, direction and booked/pending state.
- Decimal-text amounts; SAR minor-unit conversion uses integer arithmetic. Currencies are
  kept separate. No exchange-rate or aggregate-total assumptions are made.
- Saudi IBAN format/checksum validation and masked output. A checksum does not prove that
  an account exists or belongs to the company. The format follows the
  [Swift IBAN Registry](https://www.swift.com/standards/data-standards/iban-international-bank-account-number).
- Stable transaction identities scoped by company, provider, account and provider transaction
  ID, with duplicate detection. Matching by amount/date alone would merge legitimate payments.
- Separate provider `asOf` and retrieval timestamps, and partial-result markers. ERP reads
  identify their freshness basis as ERP retrieval, not a successful bank synchronization.
  The provider implementation must handle
  paging, authorization, timeouts, bounded responses and provider-specific failure recovery.

The interface keeps account-information reads separate from payment initiation, consistent
with the distinction in [SAMA's Open Banking Framework](https://www.sama.gov.sa/en-us/mediacenter/news/pages/news-1036.aspx).
No direct bank transfer, beneficiary creation, payroll-file submission, SADAD payment or
payment-initiation tool ships here. Those need the actual bank/provider APIs and a separately
validated approval/execution flow. ERP Payment Entries do not by themselves initiate bank transfers.

Payment gateways, government, fleet and IoT systems use the same external-source declaration
and validated adapter registry, or their existing ERP records when available. No provider
URLs, credentials, bank names or API methods are guessed. Disable only external tools with
`MCP_DISABLED_PLUGINS=external`; ERP record/report permissions remain independently enforced.

## Details needed later

Provide the staging URL and accounts, exact Company record, installed versions, custom
DocType/report definitions, approvers and approved document collections. For direct banking,
provide the bank/provider name, authorized integration documentation, sandbox onboarding,
company-account mapping, supported currencies and consent requirements. Configure secrets
on the server instead of sending banking passwords or API secrets in agent conversations.
