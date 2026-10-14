import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const cookieJar = vi.hoisted(() => ({
  get: vi.fn(() => ({ value: "private-session" })),
  set: vi.fn(),
  delete: vi.fn(),
}))
vi.mock("next/headers", () => ({ cookies: async () => cookieJar }))
import { loadSnapshot, validOrigin } from "./erpnext-server"
import { GET } from "../app/api/erpnext/snapshot/route"
import { POST, DELETE } from "../app/api/erpnext/session/route"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  cookieJar.set.mockClear()
  cookieJar.delete.mockClear()
})

describe("company snapshot", () => {
  const requested: URL[] = []
  function mockERP() {
    requested.length = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const target = new URL(url)
        requested.push(target)
        if (target.pathname.endsWith("get_logged_user"))
          return Response.json({ message: "ceo@example.com" })
        if (target.pathname.endsWith("Company"))
          return Response.json({
            data: [
              { name: "Company A", default_currency: "SAR" },
              { name: "Company B", default_currency: "USD" },
            ],
          })
        if (target.pathname.endsWith("Employee"))
          return new Response("private error", { status: 403 })
        return Response.json({ data: [] })
      })
    )
  }
  it("scopes every business query to a permitted selected company and isolates unavailable modules", async () => {
    mockERP()
    const snapshot = await loadSnapshot(30, "Company B")
    expect(snapshot.mode).toBe("live")
    expect(snapshot.currency).toBe("USD")
    expect(snapshot.sources.employees.error).toContain("permission")
    expect(snapshot.sources.salesInvoices).toEqual({ records: [], error: null })
    const businessRequests = requested.filter(
      (url) =>
        url.pathname.includes("/api/resource/") &&
        !url.pathname.endsWith("Company")
    )
    expect(businessRequests).toHaveLength(8)
    for (const request of businessRequests)
      expect(JSON.parse(request.searchParams.get("filters")!)).toContainEqual([
        "company",
        "=",
        "Company B",
      ])
    expect(JSON.stringify(snapshot)).not.toContain("private-session")
    expect(JSON.stringify(snapshot)).not.toContain("private error")
  })
  it("rejects company names outside the permitted Company list", async () => {
    mockERP()
    await expect(loadSnapshot(90, "Other Company")).rejects.toMatchObject({
      status: 403,
    })
    expect(
      requested.filter(
        (url) =>
          url.pathname.includes("/api/resource/") &&
          !url.pathname.endsWith("Company")
      )
    ).toHaveLength(0)
  })
  it("returns an authentication error with no preview fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ message: "Guest" }))
    )
    const response = await GET(
      new Request("https://panel.example/api/erpnext/snapshot?days=90")
    )
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.sources).toBeUndefined()
    expect(response.headers.get("cache-control")).toContain("no-store")
  })
})

describe("ERPNext sign-in boundary", () => {
  it("rejects cross-site login and logout before touching cookies or ERPNext", async () => {
    const fetcher = vi.fn()
    vi.stubGlobal("fetch", fetcher)
    const request = new Request("https://panel.example/api/erpnext/session", {
      method: "POST",
      headers: { Origin: "https://other.example" },
      body: "{}",
    })
    expect(validOrigin(request)).toBe(false)
    expect((await POST(request)).status).toBe(403)
    expect((await DELETE(request)).status).toBe(403)
    expect(fetcher).not.toHaveBeenCalled()
    expect(cookieJar.set).not.toHaveBeenCalled()
  })
  it("stores only an HttpOnly session and never echoes credentials", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response('{"message":"Logged In"}', {
            headers: { "Set-Cookie": "sid=secret-session; HttpOnly; Path=/" },
          })
      )
    vi.stubGlobal("fetch", fetcher)
    const response = await POST(
      new Request("https://panel.example/api/erpnext/session", {
        method: "POST",
        headers: { Origin: "https://panel.example" },
        body: JSON.stringify({
          username: "ceo@example.com",
          password: "secret-password",
        }),
      })
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(cookieJar.set).toHaveBeenCalledWith(
      "ceopanel_erpnext_sid",
      "secret-session",
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
      })
    )
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://dmgroup.frappe.cloud/api/method/login"
    )
  })
  it("checks the configured public origin behind a reverse proxy", () => {
    vi.stubEnv("CEOPANEL_ORIGIN", "https://ceo.example.com")
    expect(
      validOrigin(
        new Request("http://localhost:3000/api/erpnext/session", {
          headers: { Origin: "https://ceo.example.com" },
        })
      )
    ).toBe(true)
    expect(
      validOrigin(
        new Request("http://localhost:3000/api/erpnext/session", {
          headers: { Origin: "https://other.example.com" },
        })
      )
    ).toBe(false)
  })
})
