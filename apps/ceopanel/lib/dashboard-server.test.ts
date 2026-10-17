import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const config = vi.hoisted(() => ({
  agents: {} as Record<string, { roles: string[] }>,
  dashboards: {} as Record<
    string,
    { roles: string[]; mappingValidated: boolean }
  >,
}))
vi.mock("./platform/config", () => ({ platformConfig: () => config }))
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "test-session" }) }),
}))
import { dashboards, emptyDashboard } from "./dashboards"
import {
  dashboardAdapters,
  loadContext,
  loadDashboard,
} from "./dashboard-server"
import { GET } from "../app/api/dashboards/[dashboardId]/route"
const defaults = { ...dashboardAdapters }

afterEach(() => {
  vi.unstubAllGlobals()
  for (const key of Object.keys(config.agents)) delete config.agents[key]
  for (const key of Object.keys(config.dashboards))
    delete config.dashboards[key]
  Object.assign(dashboardAdapters, defaults)
})
describe("dashboard preparation", () => {
  it("does not let optional assistant assignments hide native dashboards", async () => {
    config.agents.sales = { roles: ["Sales User"] }
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("get_logged_user"))
        return Response.json({ message: "reader@example.com" })
      if (url.includes("/resource/Company?"))
        return Response.json({
          data: [{ name: "Company A", default_currency: "SAR" }],
        })
      throw Error("Unexpected assistant or role lookup")
    })
    vi.stubGlobal("fetch", fetcher)
    const context = await loadContext("Company A")
    expect(context.dashboardIds).toBeUndefined()
    expect(context.roles).toBeUndefined()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it("continues to enforce explicit dashboard role restrictions", async () => {
    config.dashboards["sales-comparison"] = {
      roles: ["Sales Manager"],
      mappingValidated: true,
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("get_logged_user"))
          return Response.json({ message: "reader@example.com" })
        if (url.includes("/resource/Company?"))
          return Response.json({
            data: [{ name: "Company A", default_currency: "SAR" }],
          })
        return Response.json({
          message: {
            name: "reader@example.com",
            roles: [{ role: "Employee" }],
          },
        })
      }),
    )
    const adapter = vi.fn()
    dashboardAdapters["sales-comparison"] = adapter
    await expect(
      loadDashboard("sales-comparison", 30, "Company A"),
    ).rejects.toMatchObject({ status: 403 })
    expect(adapter).not.toHaveBeenCalled()
  })
  it("does not request external data or invent values for any unconfigured dashboard", async () => {
    const fetcher = vi.fn()
    vi.stubGlobal("fetch", fetcher)
    for (const dashboard of dashboards.filter(
      (item) => !dashboardAdapters[item.id],
    )) {
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
      ).status,
    ).toBe(404)
    expect(
      (
        await GET(
          new Request("https://panel.example/api/dashboards/crm?days=0"),
          { params: Promise.resolve({ dashboardId: "crm" }) },
        )
      ).status,
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
            }),
      ),
    )
    const adapter = vi.fn(async () => ({
      ...emptyDashboard(dashboards[0], "2026-10-14"),
      status: "ready" as const,
      company: "Company B",
    }))
    dashboardAdapters["sales-comparison"] = adapter
    await expect(
      loadDashboard("sales-comparison", 90, "Company A"),
    ).rejects.toThrow("different company")
    expect(adapter).toHaveBeenCalledWith(
      expect.objectContaining({
        company: "Company A",
        user: "ceo@example.com",
      }),
      expect.objectContaining({ days: 90 }),
    )
  })
})
