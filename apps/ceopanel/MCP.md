# Business tools and MCP clients

The dashboard and its eight agents use the same versioned business plugin registry in
`lib/mcp/plugins.ts`. Every connected business operation travels through MCP SDK discovery
and tool-call messages. Internal calls use linked in-memory transports; external applications
connect to the Streamable HTTP endpoint at `https://YOUR-PORTAL/api/mcp`. There is no extra
network hop for internal operations.

Plugins cover ERP records/workflows, reports/dashboards, proposals/approvals, approved
knowledge, communications, field/assistant services, and external systems/Saudi banking.
Authentication, signed incoming ERP
and channel events, readiness checks, and unconfigured display metadata are control-plane
endpoints. They are not AI business tools. Workers process validated intake/indexing jobs;
they do not turn queued AI suggestions into autonomous ERP writes.

## AI tools

`list_sources`, `describe_module`, `read_records`, `read_record`, `read_report` and
`search_knowledge` are the assigned-source AI tools when their sources are configured.
`list_sources` discovers mapped IDs, not every native ERP source. The separate nine
`erp_*` tools discover and read standard/custom business DocTypes, native reports,
workflows and files under explicit ERP-wide consent; see [ERP-ASSISTANT.md](ERP-ASSISTANT.md).
Use native reports for totals, never sums from paginated record lists.

AI clients cannot discover or invoke human workspace writes, document uploads, voice sessions,
approval/rejection, reconciliation, or access administration. Proposal and business-write
tools are disabled in the current read-only release. The deferred proposal engine does
not enable them. Tool annotations describe behavior; authorization is enforced in code.

## External client activation

1. Apply all platform migrations with `npm run db:migrate`. PostgreSQL stores OAuth
   registrations, consent and tool audits. The native `erp_*` read tools require
   approved ERP reading (`ERP_AI_READ_ENABLED` and `ERP_AI_READ_ROLES`) and native
   account permissions; they do not require the Frappe bridge, a model key or Redis.
   Bridge/knowledge/background features have separate prerequisites.
2. Set the public HTTPS `CEOPANEL_ORIGIN`, `MCP_EXTERNAL_ENABLED=true`, and a random
   32-byte `MCP_AUTH_SECRET` encoded as 64 hex characters. Generate it locally with
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and put it
   in server secret configuration. Never put it in a client or commit it.
3. Configure the client's remote MCP URL as `https://YOUR-PORTAL/api/mcp`. The server
   publishes OAuth authorization metadata at `/.well-known/oauth-authorization-server`
   and resource metadata at `/.well-known/oauth-protected-resource/api/mcp`.
4. A compatible client registers its exact callback URL, uses authorization code + PKCE S256
   and the resource `https://YOUR-PORTAL/api/mcp`, then opens the consent page. The user signs
   in with ERPNext and chooses one company and agent. For native business reading,
   authorize `ceopanel:read ceopanel:erp-read`. Proposal and write tools remain disabled
   in this read-only release. The client receives its own opaque bearer token.
5. Test discovery, a permitted read, a denied source, exports, expiry and revocation
   before enabling production. Validate each intended Codex/Claude client version; the automated
   suite verifies SDK protocol interoperability, not those desktop applications themselves.

For Codex or Claude, add a remote MCP server using that URL and complete its OAuth flow.
Clients must support Streamable HTTP, OAuth discovery/dynamic registration, and PKCE.
Legacy 2025 Streamable HTTP and current protocol requests are supported by the SDK; legacy
SSE-only endpoints and arbitrary API-token passthrough are not exposed. Native loopback HTTP
callbacks are supported. Hosted callbacks require HTTPS. Browser clients additionally need
their exact origin in `MCP_CLIENT_ORIGINS`; CORS access is intentionally not enabled globally.

## Boundaries and operation

- Consent binds client, user, company, agent, and scopes. Every authenticated request reloads
  the user's ERP identity and roles. Tool arguments cannot override that scope. Current source
  permissions are checked by native ERP operations.
- App-issued access tokens expire in 15 minutes. Refresh tokens rotate, reuse revokes the
  consent, and the consent has an absolute eight-hour lifetime. ERP session expiry requires
  sign-in again. ERP credentials inside tokens are encrypted/authenticated, never logged or
  stored in job payloads. Do not log authorization headers or OAuth callback query values.
- Revoke connections under **Integration setup → MCP connections**. Signing out of ERPNext
  invalidates the underlying ERP session. Rotating the auth secret invalidates all external tokens.
- Audit rows record principal, client grant, user/company, plugin/tool, argument digest, status,
  and source references. Raw arguments, bearer tokens, and document bodies are not audit fields.
  Permission-checked source references persist between external calls for 15 minutes.
- Each plugin has a server-side disable switch through `MCP_DISABLED_PLUGINS`. Restart the
  application after configuration changes. Disabling `proposals` stops proposal tools and human
  approval tools; it does not reverse earlier ERP transactions.
- Keep external MCP disabled until its staging scenarios pass. It does not require sending
  ERP access tokens to a model provider. The dashboard's Responses API loop proxies its selected
  function calls through the local MCP client and keeps authorization inside the application.

Adding a plugin means adding a typed schema, audience, effect, and domain handler to the
registry, then testing permission failures and idempotency. There is no generic shell, SQL,
arbitrary URL fetch, raw Frappe method, or executable plugin upload tool.

## Verification

See [MCP showcase review](MCP-SHOWCASE-REVIEW.md) for the latest tool/response fixes,
live native-tool rehearsal and the remaining ChatGPT acceptance step.

`npm test` includes cryptographic/origin checks. Set `PLATFORM_TEST_DATABASE_URL` to a
disposable PostgreSQL/pgvector database to include the real MCP SDK transport, PKCE/code
binding, rotating refresh/revocation, source isolation, proposal deduplication, and current
and legacy protocol scenarios. These tests use ERP/OpenAI fixtures and never call the live ERP.

`npm run typecheck` checks the route and tool contracts. Run `npm run test:browser` against
the local development server, or set `CEOPANEL_TEST_BASE_URL` to an already running production
preview to check desktop/mobile consent and Arabic RTL without development hot reloads.
Real company permissions, vendor client versions, and ERP actions still require staging QA.
