# Staging rollout

Complete the phases below in order. Configuration checks report prerequisites; they do
not certify actual ERP permissions, reconciled KPIs, model quality or provider delivery.
Run commands from `apps/ceopanel` unless otherwise stated. No step below modifies the live ERP.

## 1. Obtain the ERP test environment

Ask the ERP/Frappe Cloud administrator for:

- A separate staging copy with the same installed apps, custom fields, reports and workflows.
- Its HTTPS origin and exact Company document name (open **Company** in ERPNext).
- CEO, manager, employee and denied/cross-company test users with their actual assigned roles.
- Permission to install `integrations/frappe` on staging using the approved deployment process.
- The intended pilot report, its filters, currencies, KPI definitions and expected results.

If no staging copy exists, the administrator can create another site and restore a backup
using [Frappe's restore process](https://docs.frappe.io/cloud/sites/migrate-an-existing-site).
Configure test recipients and provider sandboxes on the copy before testing communications.
The app cannot infer the company's KPI formulas or approve its own access mappings.

## 2. Prepare private local configuration

```sh
npm run platform:setup
npm run platform:check -- --phase=foundation
```

Setup creates ignored `.env.local` and `platform.config.json` only if they do not already
exist. It generates local receipt and MCP secrets without printing them. The new ERP URL is
`https://staging.invalid`: replace it with the actual staging origin. Set the exact Company,
PostgreSQL and Redis settings. Existing files, secrets and activation flags are preserved.
New configuration keeps AI, reads, writes, channels and remote MCP disabled.

The migration, worker, import and check commands load `.env*` with the portal's Next.js
precedence. Existing process environment takes precedence. Run them with the same
`NODE_ENV` as the portal. Relative paths resolve from the application directory.

Install the bridge and copy the reviewed mapping configuration into its private
`ceopanel_config`. Configure the same receipt secret on both ends; never put it in the
mapping JSON or share it in chat. See `integrations/frappe/README.md`.

```sh
npm run db:migrate
npm run platform:check -- --connections --phase=foundation
npm run worker
```

The connection checks use read-only PostgreSQL queries and Redis PING. They require
pgvector and all migration versions. A nonzero exit means a prerequisite for the selected
phase is missing. Start `npm run dev` in another terminal. The worker must remain running.

## 3. Discover and review record mappings

Sign into `/integrations` with the staging System Manager account. **Check rollout
configuration** reports requirements without requiring the platform database to be ready.
**View discovery inventory** additionally needs the platform database and Redis. Download
the inventory; it contains private company metadata and must stay outside version control.

```sh
npm run platform:import -- "path/to/ceopanel-discovery.json"
```

The importer writes an ignored `platform.config.draft.json` without overwriting an existing
draft. It maps supported native scalar and child-table field types. Unsupported fields,
absent optional DocTypes and unresolved scopes are listed under `discoveryReview.warnings`.
The draft disables all activation flags, AI fields, workflow actions, recipient mappings
and channel identities. It never enables a capability based on discovered metadata alone.
Discovery inspects modules listed in the bridge configuration; add approved custom module
declarations there before rediscovery. Missing optional apps do not abort the other schemas.

Review field types, required fields, shared masters, company filters, child tables,
parent-linked records and actual roles. Copy reviewed settings into the private application
and ERP bridge configurations. Enable read mappings individually, leaving writes disabled.
Restart web and worker after changing mappings. Test allowed and denied users in staging.

## 4. Reconcile a read-only pilot

Map an actual ERP report alias and one dashboard using its exact columns and date filters.
Define all four KPI labels and aggregation operators; the configuration cannot invent them.
Compare detail rows, native total rows, currencies, dates, filters and every KPI against ERP.
Test a second company and a user who must be denied.

```sh
npm run platform:check -- --connections --phase=reads
```

Record the report name, filters, expected and observed results, tester and date in the
company's acceptance record. Repeat for each dashboard before enabling it.

## 5. Evaluate assistants and approved writes

Assign actual department roles and permitted sources. Approve only the scalar fields and
document collections the company allows for AI. Set model credentials server-side and
enable `aiDataApproved` after that review. Evaluate English and Arabic answers, citations,
denied sources, model cost and failure handling against the pilot data.

```sh
npm run platform:check -- --connections --phase=assistants
```

For one agreed test action, map individual human approvers and the native workflow. Enable
only its required write mapping on both ends. Prepare a proposal, inspect its exact payload
and evidence, approve as the authorized manager and verify the ERP record and signed receipt.
Also test rejection, stale revisions, duplicate approval, revoked access and ambiguous-write
reconciliation. A missing outcome must be reconciled instead of repeating the action.

```sh
npm run platform:check -- --connections --phase=approvals
```

## 6. Activate each channel and deploy

Follow `PLATFORM.md` for email, WhatsApp and voice, and `MCP.md` for remote clients. Use actual
recipient mappings and provider sandboxes. Evaluate Arabic/English audio on supported devices.
Test mobile camera, microphone and offline draft reconnection before signing mobile builds.
Provider adapters and predictive models still require their APIs, datasets and acceptance
definitions; this workflow does not enable speculative implementations.

Deploy through `deploy/README.md`, check HTTPS and dependency readiness, run an isolated
backup/restore drill, then repeat the acceptance scenarios before production activation.

```sh
npm run platform:check -- --connections --phase=channels
```

## Local regression checks

```sh
npm run typecheck
npm test
npm run test:integration
npm run build
npm run test:browser
```

The integration command creates a unique disposable Docker project with PostgreSQL/pgvector
and Redis on random loopback ports. It runs real migrations and dependency probes before
the SQL/approval/MCP fixture scenarios, then removes its containers. It never uses the
configured company database. Docker must be running. ERP and model services are mocked;
no API credits are spent and no company ERP records are changed.

From the repository root also run `python -m unittest discover -s integrations/frappe/tests -v`.
Use `CEOPANEL_TEST_PRODUCTION=true` with browser tests after a build to test the production
server. GitHub's **CEO Panel validation** workflow runs these checks plus Linux encrypted
backup regressions on relevant changes.
