import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const cookieJar = vi.hoisted(() => ({
  get: vi.fn<(name: string) => { value: string } | undefined>(() => ({
    value: "private-session",
  })),
  set: vi.fn(),
  delete: vi.fn(),
}))
vi.mock("next/headers", () => ({ cookies: async () => cookieJar }))
import {
  client,
  loadSnapshot,
  validOrigin,
  selectCompany,
} from "./erpnext-server"
import { GET } from "../app/api/erpnext/snapshot/route"
import { POST, DELETE } from "../app/api/erpnext/session/route"
import { GET as contextGET } from "../app/api/erpnext/context/route"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  cookieJar.set.mockClear()
  cookieJar.delete.mockClear()
  cookieJar.get.mockReset().mockReturnValue({ value: "private-session" })
})

describe("company snapshot", () => {
  it("validates workspace identity and roles without fetching dashboard source metadata", async () => {
    mockERP()
    const response = await contextGET(
      new Request("https://panel.example/api/erpnext/context?navigation=0")
    )
    expect(response.status).toBe(200)
    expect((await response.json()).roles).toContain("Desk User")
    expect(requested.some((url) => url.pathname.endsWith("getdoctype"))).toBe(
      false
    )
    expect(
      requested.some((url) => url.pathname.endsWith("has_permission"))
    ).toBe(false)
  })
  it("uses an accessible company when the default is unavailable, while rejecting an explicit unauthorized selection", () => {
    vi.stubEnv("ERPNEXT_COMPANY", "Default not permitted")
    const companies = [{ name: "Allowed", default_currency: "SAR" }]
    expect(selectCompany(companies).name).toBe("Allowed")
    expect(() => selectCompany(companies, "Default not permitted")).toThrow(
      "cannot access"
    )
    expect(() => selectCompany([])).toThrow("cannot access")
  })
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
        if (target.pathname.endsWith("frappe.client.get"))
          return Response.json({
            message: {
              name: "ceo@example.com",
              roles: [{ role: "Employee" }],
              user_type: "System User",
            },
          })
        if (target.pathname.endsWith("has_permission"))
          return Response.json({ message: { has_permission: true } })
        if (target.pathname.endsWith("getdoctype"))
          return Response.json({
            docs: [
              {
                name: target.searchParams.get("doctype"),
                fields: [
                  "company",
                  "posting_date",
                  "due_date",
                  "status",
                  "base_net_total",
                  "outstanding_amount",
                  "conversion_rate",
                  "customer_name",
                  "supplier_name",
                  "transaction_date",
                  "delivery_date",
                  "per_delivered",
                  "per_billed",
                  "schedule_date",
                  "per_received",
                  "project_name",
                  "percent_complete",
                  "expected_end_date",
                  "priority",
                  "employee_name",
                  "department",
                  "designation",
                  "date_of_joining",
                ].map((fieldname) => ({ fieldname, fieldtype: "Data" })),
              },
            ],
          })
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
      vi.fn(
        async () => new Response("private native auth error", { status: 403 })
      )
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
  it.each([200, 403])(
    "clears rejected sessions after upstream HTTP %s so a stale cookie cannot trap local preview",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          status === 200
            ? Response.json({ message: "Guest" })
            : new Response("private auth error", { status })
        )
      )
      const response = await contextGET(
        new Request("https://panel.example/api/erpnext/context")
      )
      expect(response.status).toBe(401)
      expect(response.headers.get("set-cookie")).toContain(
        "ceopanel_erpnext_sid=;"
      )
      expect(response.headers.get("cache-control")).toContain("no-store")
    }
  )
  it("does not turn a local UI preview into an authenticated ERP identity", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("CEOPANEL_DISABLE_AUTH", "true")
    cookieJar.get.mockReturnValue(undefined)
    const fetcher = vi.fn()
    vi.stubGlobal("fetch", fetcher)
    await expect(client()).rejects.toMatchObject({ status: 401 })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each(["null", "[]", '"text"', "{"])(
    "rejects malformed login JSON before contacting ERP: %s",
    async (body) => {
      const fetcher = vi.fn()
      vi.stubGlobal("fetch", fetcher)
      const response = await POST(
        new Request("https://panel.example/api/erpnext/session", {
          method: "POST",
          headers: { Origin: "https://panel.example" },
          body,
        })
      )
      expect(response.status).toBe(400)
      expect(fetcher).not.toHaveBeenCalled()
      expect(cookieJar.set).not.toHaveBeenCalled()
    }
  )
  it("rejects oversized credential payloads before contacting ERP", async () => {
    const fetcher = vi.fn()
    vi.stubGlobal("fetch", fetcher)
    const response = await POST(
      new Request("https://panel.example/api/erpnext/session", {
        method: "POST",
        headers: { Origin: "https://panel.example" },
        body: "أ".repeat(3000),
      })
    )
    expect(response.status).toBe(413)
    expect(fetcher).not.toHaveBeenCalled()
  })
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
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) =>
      String(url).endsWith("get_logged_user")
        ? Response.json({ message: "ceo@example.com" })
        : new Response('{"message":"Logged In"}', {
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
    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({
      Cookie: "sid=secret-session",
    })
  })
  it("holds two-factor challenges in a short-lived HttpOnly cookie without exposing the challenge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          tmp_id: "secretchallenge",
          verification: { method: "Email", prompt: "sensitive@example.com" },
        })
      )
    )
    const response = await POST(
      new Request("https://panel.example/api/erpnext/session", {
        method: "POST",
        headers: { Origin: "https://panel.example" },
        body: JSON.stringify({
          username: "ceo@example.com",
          password: "private-password",
        }),
      })
    )
    expect(await response.json()).toEqual({ challenge: true, method: "Email" })
    expect(cookieJar.set).toHaveBeenCalledWith(
      "ceopanel_erpnext_challenge",
      "secretchallenge",
      expect.objectContaining({ httpOnly: true, maxAge: 300 })
    )
    expect(
      cookieJar.set.mock.calls.some(([name]) => name === "ceopanel_erpnext_sid")
    ).toBe(false)
  })
  it("completes native OTP verification without sending the password again", async () => {
    cookieJar.get.mockImplementation((name) =>
      name === "ceopanel_erpnext_challenge"
        ? { value: "challenge123" }
        : undefined
    )
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        String(url).endsWith("get_logged_user")
          ? Response.json({ message: "ceo@example.com" })
          : Response.json(
              { message: "Logged In" },
              { headers: { "Set-Cookie": "sid=verified-session; HttpOnly" } }
            )
      )
    vi.stubGlobal("fetch", fetcher)
    const response = await POST(
      new Request("https://panel.example/api/erpnext/session", {
        method: "POST",
        headers: { Origin: "https://panel.example" },
        body: JSON.stringify({ otp: "123456" }),
      })
    )
    expect(response.status).toBe(200)
    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string)).toEqual({
      otp: "123456",
      tmp_id: "challenge123",
    })
    expect(cookieJar.delete).toHaveBeenCalledWith("ceopanel_erpnext_challenge")
  })
  it("rejects an OTP without its challenge and rejects a guest session despite a supplied SID", async () => {
    cookieJar.get.mockReturnValue(undefined)
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        String(url).endsWith("get_logged_user")
          ? Response.json({ message: "Guest" })
          : Response.json(
              { message: "Logged In" },
              { headers: { "Set-Cookie": "sid=unverified-session" } }
            )
      )
    vi.stubGlobal("fetch", fetcher)
    const req = (body: unknown) =>
      new Request("https://panel.example/api/erpnext/session", {
        method: "POST",
        headers: { Origin: "https://panel.example" },
        body: JSON.stringify(body),
      })
    expect((await POST(req({ otp: "123456" }))).status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
    expect(
      (
        await POST(
          req({ username: "ceo@example.com", password: "private-password" })
        )
      ).status
    ).toBe(401)
    expect(cookieJar.set).not.toHaveBeenCalled()
  })
  it.each([true, false])(
    "clears local credentials and reports remote logout success %s",
    async (reachable) => {
      const fetcher = vi.fn(async () => {
        if (!reachable) throw new Error("offline")
        return Response.json({ message: "Logged Out" })
      })
      vi.stubGlobal("fetch", fetcher)
      const response = await DELETE(
        new Request("https://panel.example/api/erpnext/session", {
          method: "DELETE",
          headers: { Origin: "https://panel.example" },
        })
      )
      expect(await response.json()).toEqual({
        ok: true,
        remoteSessionRevoked: reachable,
      })
      expect(fetcher).toHaveBeenCalledWith(
        "https://dmgroup.frappe.cloud/api/method/logout",
        expect.objectContaining({
          headers: expect.objectContaining({ Cookie: "sid=private-session" }),
        })
      )
      expect(cookieJar.delete).toHaveBeenCalledWith("ceopanel_erpnext_sid")
      expect(cookieJar.delete).toHaveBeenCalledWith(
        "ceopanel_erpnext_challenge"
      )
    }
  )
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
