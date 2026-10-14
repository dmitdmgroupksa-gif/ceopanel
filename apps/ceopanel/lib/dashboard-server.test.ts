import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "test-session" }) }),
}))
import { dashboards, emptyDashboard } from "./dashboards"
import { dashboardAdapters, loadDashboard } from "./dashboard-server"
import { GET } from "../app/api/dashboards/[dashboardId]/route"

afterEach(() => {
  vi.unstubAllGlobals()
  delete dashboardAdapters["sales-comparison"]
})
describe("dashboard preparation", () => {
  it("does not request external data or invent values for any unconfigured dashboard", async () => {
    const fetcher = vi.fn()
    vi.stubGlobal("fetch", fetcher)
    for (const dashboard of dashboards) {
      const data = await loadDashboard(dashboard.id, 30)
      expect(data.status).toBe("awaiting-data")
      expect(data.metrics.every((metric) => metric.value === null)).toBe(true)
      expect(data.table.rows).toEqual([])
      expect(data.chart.points).toEqual([])
      expect(data.updatedAt).toBeNull()
    }
    expect(fetcher).not.toHaveBeenCalled()
  })
  it("rejects unknown dashboards and invalid reporting periods", async () => {
    expect(
      (
        await GET(new Request("https://panel.example/api/dashboards/missing"), {
          params: Promise.resolve({ dashboardId: "missing" }),
        })
      ).status
    ).toBe(404)
    expect(
      (
        await GET(
          new Request("https://panel.example/api/dashboards/crm?days=0"),
          { params: Promise.resolve({ dashboardId: "crm" }) }
        )
      ).status
    ).toBe(400)
  })
  it("passes a verified company to future adapters and rejects cross-company results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("get_logged_user")
          ? Response.json({ message: "ceo@example.com" })
          : Response.json({
              data: [{ name: "Company A", default_currency: "SAR" }],
            })
      )
    )
    const adapter = vi.fn(async () => ({
      ...emptyDashboard(dashboards[0], "2026-10-14"),
      status: "ready" as const,
      company: "Company B",
    }))
    dashboardAdapters["sales-comparison"] = adapter
    await expect(
      loadDashboard("sales-comparison", 90, "Company A")
    ).rejects.toThrow("different company")
    expect(adapter).toHaveBeenCalledWith(
      expect.objectContaining({
        company: "Company A",
        user: "ceo@example.com",
      }),
      expect.objectContaining({ days: 90 })
    )
  })
})
