import { describe, expect, it } from "vitest"
import { demoSnapshot } from "./demo"
import {
  businessDate,
  csv,
  makePeriod,
  monthlyTrend,
  outstanding,
  overdue,
  sum,
} from "./model"

describe("company metrics", () => {
  it("uses the company timezone and includes exactly the requested days", () => {
    expect(businessDate(new Date("2026-10-13T22:00:00Z"), "Asia/Riyadh")).toBe(
      "2026-10-14",
    )
    expect(makePeriod(30, "2026-10-14")).toEqual({
      from: "2026-09-15",
      to: "2026-10-14",
      days: 30,
    })
  })
  it("converts outstanding invoices to base currency and includes credit notes", () => {
    const dataset = {
      error: null,
      records: [
        {
          name: "USD-INVOICE",
          outstanding_amount: 100,
          conversion_rate: 3.75,
          due_date: "2026-10-13",
        },
        {
          name: "CREDIT",
          outstanding_amount: -25,
          conversion_rate: 1,
          due_date: "2026-10-12",
        },
        {
          name: "DUE-TODAY",
          outstanding_amount: 10,
          conversion_rate: 1,
          due_date: "2026-10-14",
        },
      ],
    }
    expect(outstanding(dataset)).toBe(360)
    expect(overdue(dataset, "2026-10-14").map((row) => row.name)).toEqual([
      "USD-INVOICE",
    ])
  })
  it("keeps failed sources unavailable, instead of returning zero", () => {
    expect(
      sum({ error: "Permission denied", records: [] }, "base_net_total"),
    ).toBeNull()
    expect(outstanding({ error: "Permission denied", records: [] })).toBeNull()
    expect(sum({ error: null, records: [] }, "base_net_total")).toBe(0)
  })
  it("reconciles monthly report totals to the invoice dataset, including returns", () => {
    const snapshot = demoSnapshot("2026-10-14", 30)
    snapshot.sources.salesInvoices.records.push({
      name: "RETURN",
      posting_date: "2026-10-01",
      base_net_total: -1000,
    })
    const report = monthlyTrend(snapshot)
    expect(report.map((row) => row.date)).toEqual(["2026-09", "2026-10"])
    expect(report.reduce((total, row) => total + row.sales, 0)).toBe(
      sum(snapshot.sources.salesInvoices, "base_net_total"),
    )
    expect(snapshot.mode).toBe("preview")
    expect(snapshot.syncedAt).toBeNull()
  })
  it("escapes CSV quotes and spreadsheet formula injection", () => {
    const result = csv([
      ['=HYPERLINK("bad")', "normal, value", "+cmd", "@cmd", 'a"b'],
    ])
    expect(result).toContain('"\'=HYPERLINK(""bad"")"')
    expect(result).toContain('"normal, value"')
    expect(result).toContain('"\'+cmd"')
    expect(result).toContain('"\'@cmd"')
    expect(result).toContain('"a""b"')
  })
  it("neutralizes formulas after whitespace without converting numeric credits to text", () => {
    const result = csv([
      [" \n=HYPERLINK(1)", "\t+cmd", "\uFEFF@cmd", -125.5, "-125.5", 0],
    ])
    expect(result).toContain('"\' \n=HYPERLINK(1)"')
    expect(result).toContain('"\'\t+cmd"')
    expect(result).toContain('"\'\uFEFF@cmd"')
    expect(result).toContain('"-125.5","\'-125.5","0"')
  })
})
