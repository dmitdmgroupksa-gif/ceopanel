import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const db = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock("./platform/db", () => ({
  database: () => db,
  transaction: (fn: any) => fn(db),
}))
import {
  startFrappeLogin,
  completeFrappeLogin,
  oauthERPClient,
  revokeFrappeLogin,
  isFrappeOAuthSession,
} from "./frappe-oauth"

const site = "https://erp.example"
let flow: any, session: any, tokenNumber: number, upstreamUser: string
beforeEach(() => {
  flow = session = undefined
  tokenNumber = 0
  upstreamUser = "employee@example.com"
  vi.stubEnv("CEOPANEL_ORIGIN", "https://panel.example")
  vi.stubEnv("MCP_AUTH_SECRET", "ab".repeat(32))
  vi.stubEnv("FRAPPE_OAUTH_SESSION_SECRET", "")
  vi.stubEnv("FRAPPE_OAUTH_CLIENT_ID", "fixture-client")
  vi.stubEnv("FRAPPE_OAUTH_CLIENT_SECRET", "fixture-client-secret")
  db.query.mockReset()
  db.query.mockImplementation(async (sql: string, args: any[] = []) => {
    if (sql.startsWith("DELETE FROM erp_oauth_flows WHERE expires_at"))
      return { rows: [] }
    if (sql.startsWith("INSERT INTO erp_oauth_flows")) {
      flow = {
        id_hash: args[0],
        encrypted_verifier: args[1],
        return_path: args[2],
      }
      return { rows: [] }
    }
    if (sql.startsWith("DELETE FROM erp_oauth_flows WHERE id_hash")) {
      const current = flow?.id_hash === args[0] ? flow : undefined
      flow = undefined
      return { rows: current ? [current] : [] }
    }
    if (sql.startsWith("INSERT INTO erp_oauth_sessions")) {
      session = {
        id_hash: args[0],
        owner: args[1],
        encrypted_tokens: args[2],
        token_expires_at: new Date(Date.now() + args[3] * 1000),
        revoked_at: null,
      }
      return { rows: [] }
    }
    if (sql.startsWith("SELECT * FROM erp_oauth_sessions"))
      return {
        rows:
          session?.id_hash === args[0] && !session.revoked_at ? [session] : [],
      }
    if (sql.startsWith("UPDATE erp_oauth_sessions SET encrypted_tokens")) {
      session.encrypted_tokens = args[1]
      session.token_expires_at = new Date(Date.now() + args[2] * 1000)
      return { rows: [] }
    }
    if (sql.startsWith("UPDATE erp_oauth_sessions SET revoked_at")) {
      session.revoked_at = new Date()
      return { rows: [session] }
    }
    throw Error("Unexpected database operation")
  })
  vi.stubGlobal(
    "fetch",
    vi.fn(async (raw, init) => {
      const url = new URL(String(raw))
      expect(url.origin).toBe(site)
      if (url.pathname.endsWith("get_token")) {
        expect(init.method).toBe("POST")
        const data = new URLSearchParams(init.body)
        expect(data.get("client_id")).toBe("fixture-client")
        expect(data.get("client_secret")).toBe("fixture-client-secret")
        if (data.get("grant_type") === "authorization_code")
          expect(data.get("code_verifier")?.length).toBe(64)
        return Response.json({
          access_token: `personal-token-${++tokenNumber}`,
          refresh_token: "personal-refresh",
          token_type: "Bearer",
          expires_in: 3600,
        })
      }
      if (url.pathname.endsWith("get_logged_user")) {
        const headers = new Headers(init.headers)
        expect(headers.has("Cookie")).toBe(false)
        expect(headers.get("Authorization")).toBe(
          `Bearer personal-token-${tokenNumber}`,
        )
        return Response.json({ message: upstreamUser })
      }
      if (url.pathname.endsWith("revoke_token")) return Response.json({})
      throw Error("Unexpected ERP request")
    }),
  )
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
async function login() {
  const start = await startFrappeLogin(site, "/mcp/authorize?client_id=fixture")
  const complete = await completeFrappeLogin(
    site,
    start.state,
    start.state,
    "native-code",
  )
  return { start, complete }
}
describe("Frappe native authorization-code login", () => {
  it("uses the native Frappe authorization page, exact callback, state and PKCE", async () => {
    const result = await startFrappeLogin(site, "https://evil.example")
    const url = new URL(result.redirect)
    expect(url.origin).toBe(site)
    expect(url.pathname).toBe(
      "/api/method/frappe.integrations.oauth2.authorize",
    )
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://panel.example/api/erpnext/oauth/callback",
    )
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("code_challenge")).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    )
    expect(flow.return_path).toBe("/")
    expect(result.redirect).not.toContain("fixture-client-secret")
  })
  it("binds authorization to this browser and consumes each flow once", async () => {
    const start = await startFrappeLogin(site, "/")
    await expect(
      completeFrappeLogin(site, start.state, "wrong-browser", "native-code"),
    ).rejects.toMatchObject({ status: 401 })
    expect(fetch).not.toHaveBeenCalled()
    await completeFrappeLogin(site, start.state, start.state, "native-code")
    await expect(
      completeFrappeLogin(site, start.state, start.state, "native-code"),
    ).rejects.toMatchObject({ status: 401 })
  })
  it("stores encrypted per-user tokens and exposes only an opaque browser session", async () => {
    const { complete } = await login()
    expect(isFrappeOAuthSession(complete.session)).toBe(true)
    expect(session.owner).toBe("employee@example.com")
    expect(session.id_hash).not.toBe(complete.session)
    expect(JSON.stringify(session)).not.toContain("personal-token")
    expect(JSON.stringify(session)).not.toContain("personal-refresh")
    expect(complete.next).toBe("/mcp/authorize?client_id=fixture")
    expect(await (await oauthERPClient(complete.session, site)).user()).toBe(
      "employee@example.com",
    )
  })
  it("refreshes only that user's token and rejects an upstream identity change", async () => {
    const { complete } = await login()
    session.token_expires_at = new Date(0)
    await oauthERPClient(complete.session, site)
    expect(tokenNumber).toBe(2)
    upstreamUser = "another-user@example.com"
    await expect(oauthERPClient(complete.session, site)).rejects.toMatchObject({
      status: 401,
    })
  })
  it("fails closed after local sign-out or encrypted-token tampering", async () => {
    const { complete } = await login()
    session.encrypted_tokens = "tampered"
    await expect(oauthERPClient(complete.session, site)).rejects.toMatchObject({
      status: 401,
    })
    const second = await login()
    expect(await revokeFrappeLogin(second.complete.session, site)).toBe(true)
    await expect(
      oauthERPClient(second.complete.session, site),
    ).rejects.toMatchObject({ status: 401 })
  })
  it("never falls back to a global API account when personal authorization fails", async () => {
    const { complete } = await login()
    vi.stubEnv("ERPNEXT_API_KEY", "global-fixture")
    vi.stubEnv("ERPNEXT_API_SECRET", "global-secret-fixture")
    session = undefined
    vi.mocked(fetch).mockClear()
    await expect(oauthERPClient(complete.session, site)).rejects.toMatchObject({
      status: 401,
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})
