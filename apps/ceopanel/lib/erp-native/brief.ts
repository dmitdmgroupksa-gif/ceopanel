import "server-only"
import { dashboardAdapters, type DashboardContext } from "../dashboard-server"
import { businessDate } from "../model"
import { timezone } from "../erpnext-server"
import {
  emptyDashboard,
  findDashboard,
  type DashboardData,
  type DashboardId,
} from "../dashboards"
import { ERPNextError } from "../erpnext-client"

const sources = [
  { id: "ar", metrics: ["Overdue invoice balance", "Invoices with balances"] },
  { id: "approvals", metrics: [] },
  { id: "dispatch-logistics", metrics: ["Past scheduled date", "In transit"] },
  { id: "tasks", metrics: ["Overdue tasks", "Unassigned tasks"] },
  { id: "it-service", metrics: ["High priority tickets", "Due before today"] },
  { id: "facilities", metrics: [] },
] as const
export type BriefCard = {
  id: DashboardId
  title: string
  scope: "company" | "erp-account"
  coverage: "as-of" | "window"
  coverageLabel: string
  status: "ready" | "unavailable"
  metrics: DashboardData["metrics"]
  period: DashboardData["period"]
  note?: string
  error?: string
  updatedAt: string | null
}
export type DailyBrief = {
  company: string
  currency: string
  asOf: string
  cards: BriefCard[]
}
type Loader = (
  id: DashboardId,
  context: DashboardContext,
  period: DashboardData["period"],
) => Promise<DashboardData>
export async function dailyBrief(
  context: DashboardContext,
  load: Loader = async (id, ctx, period) => {
    const adapter = dashboardAdapters[id]
    if (!adapter) throw new ERPNextError("This source is unavailable.", 409)
    return adapter(ctx, period)
  },
): Promise<DailyBrief> {
  const today = businessDate(new Date(), timezone)
  const cards: BriefCard[] = []
  // Workflow scanning is expensive. Bound upstream concurrency and never share
  // cached business results/permissions across requests or users.
  for (let start = 0; start < sources.length; start += 2) {
    cards.push(
      ...(await Promise.all(
        sources
          .slice(start, start + 2)
          .map(async (source): Promise<BriefCard> => {
            const definition = findDashboard(source.id)!
            const pending = emptyDashboard(
              definition,
              today,
              30,
              context.company,
            )
            const base = {
              id: source.id,
              title: definition.title,
              scope: pending.scope || "company",
              period: pending.period,
              coverage: ["ar", "tasks", "it-service"].includes(source.id)
                ? "as-of"
                : "window",
              coverageLabel:
                source.id === "approvals"
                  ? "Requests created in period"
                  : source.id === "dispatch-logistics"
                    ? "Scheduled in period"
                    : source.id === "facilities"
                      ? "Expired and due in window"
                      : "As of",
            } as const
            try {
              if (
                context.dashboardIds &&
                !context.dashboardIds.includes(source.id)
              )
                throw new ERPNextError("Dashboard access denied.", 403)
              const data = await load(source.id, context, pending.period)
              if (
                data.status !== "ready" ||
                data.dashboardId !== source.id ||
                data.company !== context.company ||
                data.currency !== context.currency ||
                data.period.from !== pending.period.from ||
                data.period.to !== pending.period.to
              )
                throw new ERPNextError(
                  "Source returned an invalid company or view.",
                  502,
                )
              const metrics = source.metrics.length
                ? data.metrics.filter((m) =>
                    (source.metrics as readonly string[]).includes(m.label),
                  )
                : data.metrics
              if (
                !metrics.length ||
                (source.metrics.length &&
                  metrics.length !== source.metrics.length) ||
                metrics.some(
                  (m) =>
                    typeof m.value === "number" && !Number.isFinite(m.value),
                )
              )
                throw new ERPNextError("Source returned an invalid total.", 502)
              return {
                ...base,
                status: "ready",
                metrics,
                note: data.note,
                updatedAt: data.updatedAt,
              }
            } catch (error) {
              // One denied source must not fabricate zeros or suppress other sources.
              if (error instanceof ERPNextError && error.status === 401)
                throw error
              return {
                ...base,
                status: "unavailable",
                metrics: [],
                updatedAt: null,
                error:
                  error instanceof ERPNextError
                    ? error.message
                    : "This source could not be loaded.",
              }
            }
          }),
      )),
    )
  }
  return {
    company: context.company,
    currency: context.currency,
    asOf: today,
    cards,
  }
}
