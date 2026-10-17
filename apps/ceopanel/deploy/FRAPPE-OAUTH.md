# Personal Frappe authentication for external MCP

The panel supports individual Frappe sessions and native Frappe authorization-code
login. Neither path uses the discovery API key for employee or MCP data reads.
The native login path is prepared; it becomes available after an administrator
registers an OAuth Client in Frappe and installs the two client settings below.
No OAuth Client was created or changed in the live ERP during implementation.

## Register the OAuth Client in Frappe

On `https://dmgroup.frappe.cloud`, sign in as an administrator, search for
**OAuth Client**, and create the client using the normal Frappe interface:

| Field | Value |
| --- | --- |
| App Name | Durar Panel |
| Redirect URIs | `https://panel.durar.ai/api/erpnext/oauth/callback` |
| Default Redirect URI | `https://panel.durar.ai/api/erpnext/oauth/callback` |
| Grant Type | Authorization Code |
| Response Type | Code |
| Scopes | `all openid` |
| Skip Authorization | Unchecked |
| Allowed Roles | Optional existing employee roles; this restricts who can authorize, without granting ERP data permissions |

Save the client and copy its generated **Client ID** and **Client Secret** into
the panel server's private `deploy/.env` (or `.env.local` for development):

```dotenv
FRAPPE_OAUTH_CLIENT_ID=
FRAPPE_OAUTH_CLIENT_SECRET=
ERP_AI_READ_ENABLED=true
ERP_AI_READ_ROLES=Desk User,System Manager
CEOPANEL_ORIGIN=https://panel.durar.ai
```

Fill the first two values with the actual values from Frappe. They are OAuth
application credentials, not an employee's API key/secret. Never put them in Git,
browser code, ChatGPT, logs or this guide. Native OAuth uses the existing private
64-hex `MCP_AUTH_SECRET` to encrypt personal tokens. An optional separate
`FRAPPE_OAUTH_SESSION_SECRET` can supply another 64-hex key; preserve whichever
key is used across restarts and protect it with the server configuration backup.

Frappe v14's `all` scope enables its API for the authorizing user; it does not make
that user an administrator. The panel separately exposes only read tools and
blocks ERP record creation/editing/submission/workflow execution. `openid` uses
the native authorization flow. Identity is verified with an authenticated Frappe
API call, not an unverified token claim or an email supplied by the client.

For local native-login testing, register the exact local callback separately and
set the corresponding local `CEOPANEL_ORIGIN`. Do not reuse an unmatched callback
or relax TLS/host/state validation to make a redirect work.

## Apply the platform migration and restart on EC2

After deploying this code and taking the usual encrypted backup:

```bash
cd "$HOME/ceopanel/apps/ceopanel/deploy"
nano .env
sudo docker compose build web
sudo docker compose stop web worker
sudo docker compose run --rm migrate
sudo docker compose up -d
sudo docker compose ps --all
curl --fail --show-error https://panel.durar.ai/api/platform/health
```

Migration `006-frappe-oauth.sql` adds private platform tables for one-use login
flows and encrypted personal sessions. It does not modify Frappe. Existing
deployments must explicitly update `ERP_AI_READ_ROLES` to include `Desk User`
if they still contain the earlier System Manager-only setting. Keep the generated
database/MCP/encryption secrets unchanged.

## Employee connection flow

1. The employee opens **Integrations → MCP connections** and copies the full MCP
   server URL: `https://panel.durar.ai/api/mcp`.
2. In their external client they select OAuth and dynamic client registration.
3. If a verified ERP session is missing, the native flow redirects the browser to
   Frappe's authorization endpoint, which sends unauthenticated users to Frappe's
   own login screen. The panel never receives that login password.
4. Frappe authenticates the employee and asks for authorization. Its code is
   exchanged server-to-server using a browser-bound one-use state and PKCE S256.
5. The panel verifies the actual Frappe user and shows the external MCP consent.
   Approval connects that external client to that specific user's ERP access.
6. The employee sees and can revoke only their own connections in Integrations,
   including connections initially labelled with another company.

The browser receives an opaque random session ID. Frappe access/refresh tokens
remain encrypted in the platform database; the external client receives only
panel-issued OAuth tokens. Personal Frappe refreshes are serialized, identity is
checked again, and sign-out revokes the local session before trying native token
revocation. Sessions and MCP grants have an eight-hour maximum. Native token,
session or role revocation may end access earlier.

## Permission and company behavior

- Every MCP request reloads the authenticated identity, roles and native Company
  list. No shared ERP service account is a browser/MCP fallback.
- `erp_list_companies` returns the user's currently accessible companies/currencies.
  The company selected during consent is a default context, not the only allowed
  company. Removing it does not remove access to other permitted companies.
- Exact Company selections in record/report filters are checked against that
  current list. Native row, field, parent/child and report permissions still run
  on every read. Custom reports can implement their own scope; their native
  authorization and results remain authoritative, and the app does not claim
  company isolation merely because a filter was supplied.
- Custom business DocTypes/fields and native Query, Script, Custom and saved
  Report Builder reports use effective Frappe metadata. Framework-module names do
  not automatically hide custom business DocTypes. Security/settings records,
  credentials and independent child-table reads remain excluded.
- Ordinary Desk users can discover DocType metadata through Frappe's standard
  Link search when administrative DocType listing is denied. This grants no record
  access; each subsequent schema/record/report read checks native permissions.
- Dashboard navigation uses source/field permission checks without reading business
  rows. Inaccessible views are hidden; direct links show **No access**.

## Acceptance before employee rollout

Native login cannot be tested against this ERP until the client is registered and
configured. Test two real employees with different permissions after setup:
authorize separately, compare their Company/source/report lists to Frappe, test
a denied record and a permitted custom report, remove a role/company in Frappe,
and confirm the next MCP request reflects the change. Revoking one employee's
connection must not revoke or reveal another employee's connection.

Implementation verification includes synthetic OAuth state/PKCE/identity tests,
actual disposable PostgreSQL migration/session/grant tests and desktop/mobile
permission/setup/chart checks. It does not replace this restricted-user acceptance.

Native behavior was checked against Frappe v14.100.0
[OAuth endpoints](https://github.com/frappe/frappe/blob/v14.100.0/frappe/integrations/oauth2.py),
[PKCE validation](https://github.com/frappe/frappe/blob/v14.100.0/frappe/oauth.py) and
[DocType metadata search](https://github.com/frappe/frappe/blob/v14.100.0/frappe/desk/search.py).
