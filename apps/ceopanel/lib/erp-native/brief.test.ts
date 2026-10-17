import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("../dashboard-server", () => ({ dashboardAdapters: {} }))
vi.mock("../erpnext-server", () => ({ timezone: "Asia/Riyadh" }))
import { dailyBrief } from "./brief"
import {
  emptyDashboard,
  findDashboard,
  type DashboardData,
  type DashboardId,
} from "../dashboards"
import { ERPNextError } from "../erpnext-client"
const context = {
  user: "reader",
  company: "A",
  currency: "SAR",
  companies: [],
  siteUrl: "https://erp.example",
}
function data(id: DashboardId, period: DashboardData["period"]): DashboardData {
  const labels: Record<string, string[]> = {
    ar: ["Overdue invoice balance", "Invoices with balances"],
    "dispatch-logistics": ["Past scheduled date", "In transit"],
    tasks: ["Overdue tasks", "Unassigned tasks"],
    "it-service": ["High priority tickets", "Due before today"],
  }
  return {
    ...emptyDashboard(findDashboard(id)!, period.to, 30, "A"),
    period,
    status: "ready",
    updatedAt: "2026-10-17T00:00:00Z",
    metrics: (labels[id] || ["Recorded requests"]).map((label) => ({
      label,
      value: 3,
    })),
  }
}
describe("deterministic daily briefing", () => {
  it("uses all six real adapters with source-specific periods and concurrency at most two", async () => {
    let active = 0,
      maximum = 0
    const load = vi.fn(
      async (
        id: DashboardId,
        _context: unknown,
        period: DashboardData["period"],
      ) => {
        maximum = Math.max(maximum, ++active)
        await new Promise((resolve) => setTimeout(resolve, 2))
        active--
        return data(id, period)
      },
    )
    const result = await dailyBrief(context, load)
    expect(load).toHaveBeenCalledTimes(6)
    expect(maximum).toBe(2)
    expect(result.cards.every((c) => c.status === "ready")).toBe(true)
    expect(result.cards.find((c) => c.id === "facilities")!.period.from).toBe(
      result.asOf,
    )
    expect(result.cards.find((c) => c.id === "tasks")!.scope).toBe(
      "erp-account",
    )
    expect(result.cards.find((c) => c.id === "ar")!.scope).toBe("company")
    expect(result.cards.find((c) => c.id === "ar")!.coverage).toBe("as-of")
    expect(result.cards.find((c) => c.id === "approvals")!.coverageLabel).toBe(
      "Requests created in period",
    )
  })
  it("shows unavailable sources instead of inventing zeros, preserving other cards", async () => {
    const result = await dailyBrief(context, async (id, _ctx, period) => {
      if (id === "ar") throw new ERPNextError("Finance access denied.", 403)
      const output = data(id, period)
      if (id === "it-service") output.metrics[1].value = null
      return output
    })
    expect(result.cards[0]).toMatchObject({
      status: "unavailable",
      metrics: [],
      error: "Finance access denied.",
    })
    expect(
      result.cards.find((c) => c.id === "it-service")!.metrics[1].value,
    ).toBeNull()
    expect(result.cards.filter((c) => c.status === "ready")).toHaveLength(5)
  })
  it("respects explicit dashboard roles before querying restricted sources", async () => {
    const load = vi.fn(
      async (id: DashboardId, _ctx: unknown, period: DashboardData["period"]) =>
        data(id, period),
    )
    const result = await dailyBrief({ ...context, dashboardIds: ["ar"] }, load)
    expect(load).toHaveBeenCalledTimes(1)
    expect(result.cards.filter((c) => c.status === "unavailable")).toHaveLength(
      5,
    )
  })
  it("rejects mismatched company/period/currency and missing required metrics", async () => {
    const result = await dailyBrief(context, async (id, _ctx, period) => {
      const output = data(id, period)
      if (id === "ar") output.company = "B"
      if (id === "tasks") output.period = { ...period, to: "2000-01-01" }
      if (id === "it-service") output.currency = "USD"
      if (id === "dispatch-logistics") output.metrics = []
      return output
    })
    for (const id of ["ar", "tasks", "it-service", "dispatch-logistics"])
      expect(result.cards.find((c) => c.id === id)!.status).toBe("unavailable")
  })
  it("propagates session expiry instead of retaining a partial company briefing", async () => {
    await expect(
      dailyBrief(context, async () => {
        throw new ERPNextError("Session expired.", 401)
      }),
    ).rejects.toMatchObject({ status: 401 })
  })
})
