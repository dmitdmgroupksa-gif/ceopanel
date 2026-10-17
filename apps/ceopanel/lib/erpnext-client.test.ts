import { describe, expect, it, vi } from "vitest"
import { ERPNextClient } from "./erpnext-client"

describe("ERPNext transport", () => {
  it("releases rejected ERP response streams while preserving their permission status", async () => {
    const cancel = vi.fn()
    const body = new ReadableStream({ cancel })
    const erp = new ERPNextClient(
      "https://erp.example",
      "session",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(body, { status: 403 }))
    )
    await expect(
      erp.list("Employee", { fields: ["name"] })
    ).rejects.toMatchObject({ status: 403 })
    expect(cancel).toHaveBeenCalledTimes(1)
  })
  it("recovers one interrupted GET connection without retrying a permission denial", async () => {
    const interrupted = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNRESET" },
    })
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(interrupted)
      .mockResolvedValueOnce(Response.json({ message: "reader@example.com" }))
    const erp = new ERPNextClient("https://erp.example", "session", fetcher)
    expect(await erp.user()).toBe("reader@example.com")
    expect(fetcher).toHaveBeenCalledTimes(2)
    fetcher.mockClear().mockResolvedValue(new Response(null, { status: 403 }))
    await expect(
      erp.list("Quotation", { fields: ["name"] })
    ).rejects.toMatchObject({ status: 403 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it("distinguishes report timeouts and ERP validation failures from lost connectivity", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("timed out", "TimeoutError"))
    const erp = new ERPNextClient("https://erp.example", "session", fetcher)
    await expect(
      erp.request("/api/method/frappe.desk.query_report.run?report_name=Test")
    ).rejects.toMatchObject({
      status: 504,
      message: "ERP report timed out. Narrow the filters and try again.",
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    fetcher.mockResolvedValue(
      new Response("private ERP traceback", { status: 417 })
    )
    await expect(
      erp.request("/api/method/frappe.desk.query_report.run?report_name=Test")
    ).rejects.toMatchObject({ status: 400 })
  })
  it("paginates every result and sends session credentials only to the configured origin", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          data: Array.from({ length: 200 }, (_, i) => ({ name: `INV-${i}` })),
        })
      )
      .mockResolvedValueOnce(Response.json({ data: [{ name: "LAST" }] }))
    const erp = new ERPNextClient(
      "https://example.frappe.cloud",
      "private-session",
      fetcher
    )
    const records = await erp.list("Sales Invoice", {
      fields: ["name"],
      filters: [["company", "=", "Company A"]],
    })
    expect(records).toHaveLength(201)
    const [url, options] = fetcher.mock.calls[1]
    const query = new URL(String(url))
    expect(query.origin).toBe("https://example.frappe.cloud")
    expect(query.searchParams.get("limit_start")).toBe("200")
    expect(JSON.parse(query.searchParams.get("filters")!)).toEqual([
      ["company", "=", "Company A"],
    ])
    expect(options).toMatchObject({
      headers: { Cookie: "sid=private-session" },
      cache: "no-store",
      redirect: "error",
    })
  })
  it("refuses to publish truncated financial totals", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (raw) =>
      Response.json({
        data: Array.from({ length: 200 }, (_, i) => ({
          name: `INV-${Number(new URL(String(raw)).searchParams.get("limit_start")) + i}`,
        })),
      })
    )
    await expect(
      new ERPNextClient(
        "https://example.frappe.cloud",
        "session",
        fetcher
      ).list("Sales Invoice", { fields: ["name"] })
    ).rejects.toThrow("More than 10,000 records")
  })
  it("rejects guests and preserves permission failures", async () => {
    const guest = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ message: "Guest" }))
    await expect(
      new ERPNextClient("https://example.frappe.cloud", "session", guest).user()
    ).rejects.toMatchObject({ status: 401 })
    const denied = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("private upstream trace", { status: 403 })
      )
    await expect(
      new ERPNextClient("https://example.frappe.cloud", "session", denied).list(
        "Employee",
        { fields: ["name"] }
      )
    ).rejects.toMatchObject({
      status: 403,
      message:
        "Your ERPNext account does not have permission to read these records.",
    })
  })
  it("rejects malformed upstream responses", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: "not a list" }))
    await expect(
      new ERPNextClient(
        "https://example.frappe.cloud",
        "session",
        fetcher
      ).list("Project", { fields: ["name"] })
    ).rejects.toThrow("invalid record list")
  })
  it("preserves OR filters on every page and rejects duplicate or malformed identities", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ data: [{ name: "A" }, { name: "A" }] })
      )
    const erp = new ERPNextClient(
      "https://example.frappe.cloud",
      "session",
      fetcher
    )
    const query = {
      fields: ["name"],
      orFilters: [["name", "like", "%term%"]] as [string, string, string][],
    }
    await expect(erp.list("Customer", query)).rejects.toMatchObject({
      status: 409,
    })
    expect(
      JSON.parse(
        new URL(String(fetcher.mock.calls[0][0])).searchParams.get(
          "or_filters"
        )!
      )
    ).toEqual(query.orFilters)
    fetcher.mockResolvedValue(Response.json({ data: [null] }))
    await expect(erp.list("Customer", query)).rejects.toThrow(
      "invalid record list"
    )
  })
  it("normalizes an invalid native SID at the identity endpoint without masking record permission errors", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("private native auth error", { status: 403 })
      )
    const erp = new ERPNextClient(
      "https://example.frappe.cloud",
      "invalid-session",
      fetcher
    )
    await expect(erp.user()).rejects.toMatchObject({ status: 401 })
    await expect(
      erp.list("Employee", { fields: ["name"] })
    ).rejects.toMatchObject({ status: 403 })
  })
})
