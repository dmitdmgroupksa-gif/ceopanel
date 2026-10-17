import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  complete: vi.fn(),
  cookie: vi.fn(),
}))
vi.mock("./frappe-oauth", () => ({
  startFrappeLogin: mocks.start,
  completeFrappeLogin: mocks.complete,
  FRAPPE_FLOW_COOKIE: "ceopanel_frappe_oauth",
}))
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookie }),
}))
vi.mock("./erpnext-server", () => ({
  siteUrl: () => "https://erp.example",
}))
import { GET } from "../app/api/erpnext/oauth/[action]/route"
import { ERPNextError } from "./erpnext-client"

beforeEach(() => {
  vi.stubEnv("CEOPANEL_ORIGIN", "https://panel.example")
  mocks.start.mockReset().mockResolvedValue({
    state: "browser-bound-state",
    redirect:
      "https://erp.example/api/method/frappe.integrations.oauth2.authorize",
  })
  mocks.complete.mockReset().mockResolvedValue({
    session: `frappe_oauth_${"ab".repeat(32)}`,
    next: "/mcp/authorize?client_id=external",
  })
  mocks.cookie.mockReset().mockReturnValue({ value: "browser-bound-state" })
})
afterEach(() => vi.unstubAllEnvs())
function request(action: string, query = "", host = "panel.example") {
  return GET(
    new Request(`https://panel.example/api/erpnext/oauth/${action}${query}`, {
      headers: { host, "x-forwarded-host": "attacker.example" },
    }),
    { params: Promise.resolve({ action }) }
  )
}
describe("native Frappe OAuth HTTP boundary", () => {
  it("redirects to Frappe with a secure browser state cookie and private headers", async () => {
    const response = await request("start", "?next=%2Fintegrations")
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toContain("https://erp.example/")
    expect(mocks.start).toHaveBeenCalledWith(
      "https://erp.example",
      "/integrations"
    )
    const cookie = response.cookies.get("ceopanel_frappe_oauth")!
    expect(cookie).toMatchObject({
      value: "browser-bound-state",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    })
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
  })
  it("passes browser state to verification and sets only an opaque panel session", async () => {
    const response = await request(
      "callback",
      "?state=browser-bound-state&code=native-code"
    )
    expect(mocks.complete).toHaveBeenCalledWith(
      "https://erp.example",
      "browser-bound-state",
      "browser-bound-state",
      "native-code"
    )
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "https://panel.example/mcp/authorize?client_id=external"
    )
    expect(response.cookies.get("ceopanel_erpnext_sid")).toMatchObject({
      value: `frappe_oauth_${"ab".repeat(32)}`,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 28800,
    })
    expect(response.cookies.get("ceopanel_frappe_oauth")?.value).toBe("")
  })
  it("rejects untrusted hosts without trusting forwarded host headers", async () => {
    const response = await request("start", "", "attacker.example")
    expect(response.status).toBe(403)
    expect(mocks.start).not.toHaveBeenCalled()
    expect(mocks.complete).not.toHaveBeenCalled()
    expect(response.cookies.get("ceopanel_erpnext_sid")).toBeUndefined()
  })
  it("never creates a session when Frappe denies authorization", async () => {
    const response = await request(
      "callback",
      "?error=access_denied&error_description=private-detail"
    )
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "https://panel.example/login?frappe_error=1"
    )
    expect(mocks.complete).not.toHaveBeenCalled()
    expect(response.cookies.get("ceopanel_erpnext_sid")).toBeUndefined()
    expect(response.headers.get("location")).not.toContain("private-detail")
  })
  it("preserves authentication failures without exposing unexpected internal errors", async () => {
    mocks.complete.mockRejectedValueOnce(
      new ERPNextError("Login expired.", 401)
    )
    const expired = await request("callback", "?state=old&code=old")
    expect(expired.status).toBe(401)
    expect(expired.cookies.get("ceopanel_erpnext_sid")).toBeUndefined()
    mocks.complete.mockRejectedValueOnce(
      new Error("internal-token-or-database-detail")
    )
    const failed = await request("callback", "?state=old&code=old")
    expect(failed.status).toBe(502)
    expect(await failed.text()).not.toContain(
      "internal-token-or-database-detail"
    )
  })
})
