import { describe, expect, it, vi } from "vitest"
import { nativeDashboard, nativeDashboardIds } from "./dashboards"
import { makePeriod, type ERPDocument } from "../model"

const context = {
  user: "user@example.com",
  company: "Company A",
  currency: "SAR",
  companies: [],
  siteUrl: "https://example.frappe.cloud",
}
const period = makePeriod(30, "2026-10-15")
const record = (
  name: string,
  values: Record<string, string | number | null>,
): ERPDocument => ({ name, company: context.company, docstatus: 1, ...values })
function reader(records: ERPDocument[] = []) {
  return { list: vi.fn(async () => records) }
}

describe("native read-only dashboards", () => {
  it.each(nativeDashboardIds)(
    "scopes %s to the company and returns genuine empty results",
    async (id) => {
      const erp = reader()
      const data = await nativeDashboard(erp, id, context, period)
      expect(data.status).toBe("ready")
      expect(data.company).toBe(context.company)
      expect(data.metrics).toHaveLength(4)
      expect(data.table.rows).toEqual([])
      for (const [, query] of erp.list.mock.calls as unknown as [
        string,
        { filters: unknown[] },
      ][]) {
        expect(query.filters).toContainEqual(["company", "=", context.company])
      }
      expect(data.note).toBeTruthy()
    },
  )
  it("compares equal periods, includes returns and uses company-currency net values", async () => {
    const erp = reader([
      record("CURRENT", {
        posting_date: "2026-10-01",
        base_net_total: "100.25",
      }),
      record("RETURN", { posting_date: "2026-10-02", base_net_total: -20 }),
      record("PREVIOUS", { posting_date: "2026-09-01", base_net_total: 40 }),
    ])
    const data = await nativeDashboard(erp, "sales-comparison", context, period)
    expect(data.metrics.slice(0, 3).map((metric) => metric.value)).toEqual([
      80.25, 40, 40.25,
    ])
    expect(data.metrics[3].value).toBeCloseTo(100.625)
    expect(data.table.rows.map((row) => row.id)).toEqual(["CURRENT", "RETURN"])
    expect(
      data.chart.points.reduce((sum, point) => sum + Number(point.previous), 0),
    ).toBe(40)
    const query = (
      erp.list.mock.calls as unknown as [string, { filters: unknown[] }][]
    )[0][1]
    expect(query.filters).toContainEqual(["posting_date", ">=", "2026-08-17"])
    expect(query.filters).toContainEqual(["posting_date", "<=", "2026-10-15"])
    expect(query.filters).toContainEqual(["docstatus", "=", 1])
  })
  it("uses no percentage when the previous-period baseline is zero", async () => {
    const data = await nativeDashboard(
      reader(),
      "sales-comparison",
      context,
      period,
    )
    expect(data.metrics[3].value).toBeNull()
    expect(data.metrics[3].note).toBe("No prior-period baseline")
  })
  it.each([null, undefined, "", "invalid", Infinity])(
    "rejects an unavailable financial amount: %s",
    async (value) => {
      const erp = reader([
        record("INV", {
          posting_date: "2026-10-01",
          base_net_total: value as number,
        }),
      ])
      await expect(
        nativeDashboard(erp, "sales-comparison", context, period),
      ).rejects.toThrow("required ERP number")
    },
  )
  it("rejects cross-company and duplicated rows rather than publishing totals", async () => {
    await expect(
      nativeDashboard(
        reader([record("INV", { company: "Other" })]),
        "hr",
        context,
        period,
      ),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      nativeDashboard(
        reader([record("INV", {}), record("INV", {})]),
        "hr",
        context,
        period,
      ),
    ).rejects.toThrow("duplicate")
  })
  it("does not turn permission failures or truncated reads into zeros", async () => {
    const erp = {
      list: vi.fn().mockRejectedValue(new Error("More than 10,000 records")),
    }
    await expect(
      nativeDashboard(erp, "sales-comparison", context, period),
    ).rejects.toThrow("10,000")
  })
  it("rejects drafts and out-of-period records even if the ERP ignores a query filter", async () => {
    for (const values of [
      { docstatus: 0, posting_date: "2026-10-01" },
      { docstatus: 1, posting_date: "2026-12-01" },
    ])
      await expect(
        nativeDashboard(
          reader([record("INV", { ...values, base_net_total: 100 })]),
          "sales-comparison",
          context,
          period,
        ),
      ).rejects.toMatchObject({ status: 409 })
  })
  it("excludes internal transfers from collection/payment totals", async () => {
    const erp = reader([
      record("RECEIPT", {
        posting_date: "2026-10-01",
        payment_type: "Receive",
        base_received_amount: 100,
        base_paid_amount: 100,
      }),
      record("PAYMENT", {
        posting_date: "2026-10-01",
        payment_type: "Pay",
        base_received_amount: 25,
        base_paid_amount: 25,
      }),
      record("TRANSFER", {
        posting_date: "2026-10-01",
        payment_type: "Internal Transfer",
        base_received_amount: 500,
        base_paid_amount: 500,
      }),
    ])
    const data = await nativeDashboard(
      erp,
      "payments-collections",
      context,
      period,
    )
    expect(data.metrics.map((metric) => metric.value)).toEqual([100, 25, 1, 1])
    expect(data.table.rows).toHaveLength(3)
  })
  it("converts invoice balances, ages them by due date and preserves unknown due dates", async () => {
    const erp = reader([
      record("OVERDUE", {
        customer: "A",
        outstanding_amount: 100,
        conversion_rate: 3.75,
        due_date: "2026-09-01",
        posting_date: "2026-08-01",
      }),
      record("FUTURE", {
        customer: "A",
        outstanding_amount: 50,
        conversion_rate: 1,
        due_date: "2026-10-20",
        posting_date: "2026-10-01",
      }),
      record("UNKNOWN", {
        customer: "B",
        outstanding_amount: 10,
        conversion_rate: 1,
        due_date: null,
        posting_date: "2026-10-01",
      }),
    ])
    const data = await nativeDashboard(erp, "ar", context, period)
    expect(data.metrics.map((metric) => metric.value)).toEqual([435, 375, 3, 2])
    expect(
      data.chart.points.find((point) => point.label === "31–60 days")?.balance,
    ).toBe(375)
    expect(data.table.rows.find((row) => row.id === "UNKNOWN")?.days).toBeNull()
  })
  it("rejects invalid conversion rates", async () => {
    await expect(
      nativeDashboard(
        reader([
          record("INV", {
            posting_date: "2026-10-01",
            outstanding_amount: 10,
            conversion_rate: 0,
          }),
        ]),
        "ar",
        context,
        period,
      ),
    ).rejects.toThrow("exchange rate")
  })
  it("rejects impossible invoice and aging dates instead of normalizing them into another month", async () => {
    await expect(
      nativeDashboard(
        reader([
          record("INV", {
            posting_date: "2026-02-30",
            base_net_total: 100,
          }),
        ]),
        "sales-comparison",
        context,
        period,
      ),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      nativeDashboard(
        reader([
          record("INV", {
            posting_date: "2026-10-01",
            due_date: "2026-02-30",
            outstanding_amount: 100,
            conversion_rate: 1,
          }),
        ]),
        "ar",
        context,
        period,
      ),
    ).rejects.toMatchObject({ status: 409 })
  })
  it("counts only open, unfulfilled orders as pending", async () => {
    const rows = [
      record("OPEN", {
        transaction_date: "2026-10-01",
        base_net_total: 100,
        status: "To Deliver and Bill",
        per_delivered: 50,
        per_billed: 0,
      }),
      record("CLOSED", {
        transaction_date: "2026-10-01",
        base_net_total: 200,
        status: "Closed",
        per_delivered: 0,
        per_billed: 0,
      }),
      record("DONE", {
        transaction_date: "2026-10-01",
        base_net_total: 300,
        status: "Completed",
        per_delivered: 100,
        per_billed: 100,
      }),
    ]
    const data = await nativeDashboard(
      reader(rows),
      "sales-operation",
      context,
      period,
    )
    expect(data.metrics.map((metric) => metric.value)).toEqual([3, 600, 1, 1])
  })
  it("does not assume half-day or work-from-home records are absent", async () => {
    const rows = [
      "Present",
      "Absent",
      "On Leave",
      "Half Day",
      "Work From Home",
    ].map((status, index) =>
      record(String(index), { attendance_date: "2026-10-01", status }),
    )
    const data = await nativeDashboard(
      reader(rows),
      "attendance",
      context,
      period,
    )
    expect(data.metrics.map((metric) => metric.value)).toEqual([5, 1, 1, 1])
    expect(data.table.rows).toHaveLength(5)
  })
})
