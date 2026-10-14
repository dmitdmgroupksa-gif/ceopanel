# CEO Panel Frappe bridge

Install this Frappe app **on a staging clone first** through the company's approved custom-app
deployment process. On a bench you administer, add the repository app source to the bench
and install `ceopanel_bridge` on the named staging site. This repository has not modified
the live ERP site or installed an app there. Confirm the cloud plan supports custom apps.

Set the site's private `ceopanel_config` to the same approved module/report/workflow
configuration used by CEO Panel. Never put ERP credentials into that configuration.
The bridge uses the caller's session, Company access, DocType/document permissions,
permitted field levels (including child tables), native version checks and ERP workflows.
Mutations accept POST only and use Frappe CSRF verification. No ignore-permissions flags
are exposed. ERP uses minimal Company Comment receipts to reconcile approved operations;
receipt creation failure rolls back the ERP transaction.
Set a private `ceopanel_receipt_secret` in site configuration and the same value in CEO
Panel's `ERPNEXT_RECEIPT_SECRET`. Both ends verify receipt identity and HMAC signatures;
ordinary user-created comments cannot forge an execution proof.

API namespace: `ceopanel_bridge.api`. Read `discovery` as a System Manager to inspect versions,
configured fields, custom DocTypes/reports, and workflow states/transitions. Missing mappings
or flags fail closed. Configure all 14 standard modules and custom types with actual fields
before activation. Payroll/HR features depend on the apps installed on the company site.

For events, configure a Frappe Webhook secret matching `ERPNEXT_WEBHOOK_SECRET`, pointing to
`https://YOUR-CEO-ORIGIN/api/platform/events/erpnext`. Send JSON containing `doctype`, `name`,
and `modified`; Frappe supplies `X-Frappe-Webhook-Signature` (base64 HMAC-SHA256 of raw bytes).
Do not include full payroll/bank records in event payloads.

ERP integration acceptance requires actual staging tests; local Python compilation only
checks syntax. Verify allowed reads, denied users/fields, child IDs, concurrent saves,
workflow conditions and receipt atomicity against the installed Frappe version.
