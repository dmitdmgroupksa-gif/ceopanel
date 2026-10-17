# Login and navigation

Use `/login` with an existing company ERPNext account. Account creation and password recovery belong to the ERP administrator; the recovery link opens the configured ERP site. No app-specific account database or default administrator credentials are introduced.

The route proxy is an optimistic cookie check. A forged cookie cannot load company views: the shared session boundary calls the server context endpoint, which verifies the native user and permitted Company list before mounting them. All business API handlers independently enforce ERPNext authorization. Static module definitions may be present in server-rendered component payloads; they contain no business records or authenticated context. Sessions are rechecked on focus and every minute while visible. A 401 from any company API immediately removes the company view and returns to login. Temporary ERP outages fail closed with a retry screen.

This site's native identity endpoint returns 403 for an invalid SID. That identity
failure is normalized to 401, and the context response clears the rejected cookie.
Ordinary record-permission failures remain 403 and do not clear a valid session.

Passwords go only through the same-origin, size-limited session endpoint to the configured HTTPS ERP origin. They are never stored locally. The issued SID is verified with `frappe.auth.get_logged_user`, then held in an HttpOnly, SameSite=Lax cookie with Secure in production. Native Frappe attempt controls remain authoritative. Login and logout reject foreign origins, use timeouts, and do not cache responses. Return paths allow only company pages and the existing explicit MCP consent route.

Native v14 two-factor login uses Frappe's `tmp_id` and `otp` contract. The temporary ID is in an HttpOnly cookie for at most five minutes; Frappe enforces its shorter method-specific expiry. The browser submits only the six-digit code on the second step. Frappe handles delivery and authenticator enrollment emails. No bypass for mandatory 2FA exists. Invalid/expired codes can be retried or the login restarted. SSO-only accounts require their provider's separate flow.

Logout calls the native current-session logout endpoint, then clears local SID and challenge cookies. If upstream revocation fails, the browser still signs out and receives an explicit warning. Existing MCP grants remain bound to their native session and are subject to native identity checks.

The shared sidebar holds the eight main routes, with a persistent compact preference that stores only presentation state. On mobile it becomes a modal drawer with focus trapping, Escape dismissal, and route-change closure. Secondary dashboard navigation uses Radix tabs and portaled tooltips: full names appear on hover and keyboard focus without clipping in the scroll container. Touch users can use the named quick selector. RTL and reduced-motion preferences are supported. Animations use CSS transforms and opacity; no extra animation dependency was added.

## Local interface testing

Set `CEOPANEL_DISABLE_AUTH=true` in `apps/ceopanel/.env.development.local`, then start or restart `next dev`. Set it to `false` and restart to require sign-in again. This private server setting applies only in development on `localhost`, `127.0.0.1`, or `[::1]`. It is ignored by production builds and production servers, even if set to true.

With the switch enabled, all eight company sections open without logging in. The login page remains at `/login` with an **Open local preview** link. The sidebar identifies the anonymous view as **Local preview**. This mode has no ERP identity, assigned roles, company records, or invented financial data. Business requests and mutations are not enabled by the preview; every native, platform, workspace, and MCP API retains its usual authentication and authorization. An ERP SID cookie selects the normal authenticated session boundary instead, so signing in loads permitted live records even while the local-preview switch is enabled. The SID is verified before company views mount. Turn the switch off to test mandatory sign-in and OAuth consent. ERP writes remain disabled in this release regardless of this switch or native permissions. Anonymous preview cannot authorize external MCP clients.

Browser suites that test mandatory sign-in behavior set `CEOPANEL_DISABLE_AUTH=false` explicitly. Anonymous preview cases use a local development server without API mocks or fixture session cookies. A separate fixture-based case verifies that an existing session switches out of preview and initiates authenticated reads.

Run `npm run test:preview` from the app directory to start the preview test server. If `next dev` is already running, set `CEOPANEL_TEST_BASE_URL=http://127.0.0.1:3001` to test that server instead. Next allows one development server per build directory.

## References

- [Auth.js Next.js example on GitHub](https://github.com/nextauthjs/next-auth-example): reference for dedicated sign-in and session flows. The implementation uses the existing native ERP session adapter, rather than installing independent social login providers.
- [Next.js authentication guide](https://nextjs.org/docs/app/guides/authentication): optimistic route checks and authorization at the data boundary; APIs were checked against this repository's installed Next.js guides.
- [Frappe v14.100.0 authentication source](https://github.com/frappe/frappe/blob/v14.100.0/frappe/auth.py), [two-factor source](https://github.com/frappe/frappe/blob/v14.100.0/frappe/twofactor.py), and [logout handler](https://github.com/frappe/frappe/blob/v14.100.0/frappe/handler.py): pinned to the reported company framework version.
- [Radix Tooltip documentation and animation example](https://www.radix-ui.com/primitives/docs/components/tooltip): accessible hover/focus triggers, portal placement, state attributes, and transform origin.
- [Motion hover animation guide](https://motion.dev/docs/react-hover-animation): reference for restrained hover transforms and limiting hover effects to hover-capable devices. The final transitions use CSS and the existing Radix primitives.

## Verification

Unit coverage checks return-path rejection, cookie security, native identity verification, two-factor continuation, origin checks, malformed payloads, and remote logout failure. Playwright covers login errors, OTP, return paths, session expiry, ERP downtime, all navigation destinations, keyboard tooltips, drawer behavior, and reduced motion on desktop and mobile. Fixtures intercept browser APIs only; there is no production authentication bypass. These checks do not establish that an actual company account, SMTP/SMS delivery, SSO, or custom ERP login overrides have been accepted against the live ERP site.
