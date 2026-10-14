import { describe, expect, it, vi } from "vitest"
import { ERPNextClient } from "./erpnext-client"

describe("ERPNext transport", () => {
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
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({
          data: Array.from({ length: 200 }, (_, i) => ({ name: `INV-${i}` })),
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
})
