import { describe, expect, it } from "vitest"
import { dashboardFromReport } from "./report-mapping"
import { dashboards } from "../dashboards"
const context = {
  user: "ceo",
  company: "Durar",
  companies: [],
  currency: "SAR",
  siteUrl: "https://example.frappe.cloud",
}
const period = { from: "2026-10-01", to: "2026-10-14", days: 14 }
const mapping = {
  report: "validated-report",
  roles: ["CEO"],
  mappingValidated: true,
  periodFilters: { from: "from_date", to: "to_date" },
  metrics: dashboards[0].metrics.map((label) => ({
    label,
    column: "value",
    aggregate: "sum" as const,
    format: "currency" as const,
  })),
  columns: [{ key: "value", label: "Value" }],
  chart: { labelField: "month", series: [{ key: "value", label: "Sales" }] },
}
const report = {
  columns: [
    { key: "value", label: "Value" },
    { key: "month", label: "Month" },
  ],
  rows: [
    { value: 10, month: "October" },
    { value: 20, month: "October" },
  ],
}
describe("validated report dashboard mapping", () => {
  it("uses complete report values and groups chart data deterministically", () => {
    const result = dashboardFromReport(
      dashboards[0],
      context,
      period,
      mapping,
      report,
    )
    expect(result.company).toBe("Durar")
    expect(result.metrics[0].value).toBe(30)
    expect(result.chart.points).toEqual([{ label: "October", value: 30 }])
    expect(result.table.rows).toHaveLength(2)
  })
  it("refuses mismatched columns and invalid numeric totals", () => {
    expect(() =>
      dashboardFromReport(dashboards[0], context, period, mapping, {
        columns: [],
        rows: [],
      }),
    ).toThrow("columns")
    expect(() =>
      dashboardFromReport(dashboards[0], context, period, mapping, {
        ...report,
        rows: [{ value: "30", month: "October" }],
      }),
    ).toThrow("non-numeric")
    expect(() =>
      dashboardFromReport(
        dashboards[0],
        context,
        period,
        { ...mapping, metrics: [] },
        report,
      ),
    ).toThrow("metric definitions")
  })
  it("refuses arithmetic overflow rather than publishing a null JSON total", () => {
    expect(() =>
      dashboardFromReport(dashboards[0], context, period, mapping, {
        ...report,
        rows: [
          { value: 1e308, month: "October" },
          { value: 1e308, month: "October" },
        ],
      }),
    ).toThrow("supported range")
  })
})
