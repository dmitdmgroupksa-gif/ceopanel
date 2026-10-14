import type { DashboardContext } from "../dashboard-server"
import type { DashboardData, DashboardDefinition } from "../dashboards"
import type { ReportData } from "../workspace"
import type { PlatformConfig } from "./config"
import { ERPNextError } from "../erpnext-client"
export function dashboardFromReport(
  definition: DashboardDefinition,
  context: DashboardContext,
  period: DashboardData["period"],
  mapping: PlatformConfig["dashboards"][string],
  report: ReportData,
): DashboardData {
  const keys = new Set(report.columns.map((c) => c.key))
  const required = [
    ...mapping.metrics
      .filter((m) => m.aggregate !== "count")
      .map((m) => m.column),
    ...mapping.columns.map((c) => c.key),
    ...(mapping.chart
      ? [mapping.chart.labelField, ...mapping.chart.series.map((s) => s.key)]
      : []),
  ]
  if (required.some((key) => !keys.has(key)))
    throw new ERPNextError(
      "Report columns do not match the validated dashboard mapping.",
      409,
    )
  if (
    mapping.metrics.length !== definition.metrics.length ||
    mapping.metrics.some((m, i) => m.label !== definition.metrics[i])
  )
    throw new ERPNextError(
      "Dashboard metric definitions do not match the configured view.",
      409,
    )
  function numeric(values: unknown[]) {
    if (values.some((v) => typeof v !== "number" || !Number.isFinite(v)))
      throw new ERPNextError(
        "Report contains a non-numeric KPI value. Totals are unavailable.",
        409,
      )
    return values as number[]
  }
  const metrics = mapping.metrics.map((m) => {
    const values = report.rows.map((row) => row[m.column])
    let value: number | string | null = null
    if (m.aggregate === "count") value = report.rows.length
    else if (m.aggregate === "last") value = values.at(-1) ?? null
    else if (values.length) {
      const numbers = numeric(values)
      const sum = numbers.reduce((a, b) => a + b, 0)
      value = m.aggregate === "average" ? sum / numbers.length : sum
    }
    return {
      label: m.label,
      value,
      format: m.format,
      note: report.rows.length ? "Company data" : "No records in this view.",
    }
  })
  const points = new Map<
    string,
    { label: string; [key: string]: string | number }
  >()
  if (mapping.chart)
    for (const row of report.rows) {
      const label = String(row[mapping.chart.labelField] ?? "")
      const point = points.get(label) || { label }
      for (const series of mapping.chart.series) {
        const [number] = numeric([row[series.key]])
        point[series.key] = Number(point[series.key] || 0) + number
      }
      points.set(label, point)
    }
  return {
    dashboardId: definition.id,
    status: "ready",
    company: context.company,
    currency: context.currency,
    period,
    updatedAt: new Date().toISOString(),
    metrics,
    chart: {
      title: definition.chart,
      series: mapping.chart?.series || [],
      points: [...points.values()],
    },
    table: {
      columns: mapping.columns,
      rows: report.rows.map((row, i) => ({
        id: String(i),
        ...Object.fromEntries(
          mapping.columns.map((c) => [c.key, row[c.key] ?? null]),
        ),
      })),
    },
  }
}
