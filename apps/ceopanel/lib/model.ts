export type ERPDocument = {
  name: string
  [field: string]: string | number | null
}
export type Company = { name: string; default_currency: string }
export type SourceKey =
  | "salesInvoices"
  | "receivables"
  | "purchaseInvoices"
  | "payables"
  | "salesOrders"
  | "purchaseOrders"
  | "projects"
  | "employees"
export type Dataset = { records: ERPDocument[]; error: string | null }
export type Period = { from: string; to: string; days: number }
export type Snapshot = {
  mode: "preview" | "live"
  company: string
  companies: Company[]
  currency: string
  siteUrl: string
  timezone: string
  period: Period
  syncedAt: string | null
  user: string | null
  sources: Record<SourceKey, Dataset>
}

export function businessDate(now = new Date(), timezone = "Asia/Riyadh") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

export function makePeriod(days: number, today: string): Period {
  const start = new Date(`${today}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - days + 1)
  return { from: start.toISOString().slice(0, 10), to: today, days }
}

export function numeric(value: unknown): number {
  const result = Number(value ?? 0)
  return Number.isFinite(result) ? result : 0
}

export function sum(dataset: Dataset, field: string) {
  return dataset.error
    ? null
    : dataset.records.reduce((total, row) => total + numeric(row[field]), 0)
}

export function outstanding(dataset: Dataset) {
  return dataset.error
    ? null
    : dataset.records.reduce(
        (total, row) =>
          total +
          numeric(row.outstanding_amount) * numeric(row.conversion_rate ?? 1),
        0
      )
}

export function overdue(dataset: Dataset, today: string) {
  return dataset.records.filter(
    (row) =>
      String(row.due_date ?? "") !== "" &&
      String(row.due_date) < today &&
      numeric(row.outstanding_amount) > 0
  )
}

export function monthlyTrend(snapshot: Snapshot) {
  const months = new Map<
    string,
    { date: string; sales: number; purchases: number }
  >()
  const cursor = new Date(`${snapshot.period.from.slice(0, 7)}-01T00:00:00Z`)
  const end = snapshot.period.to.slice(0, 7)
  while (cursor.toISOString().slice(0, 7) <= end) {
    const key = cursor.toISOString().slice(0, 7)
    months.set(key, { date: key, sales: 0, purchases: 0 })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  for (const [source, field] of [
    ["salesInvoices", "sales"],
    ["purchaseInvoices", "purchases"],
  ] as const) {
    if (snapshot.sources[source].error) continue
    for (const row of snapshot.sources[source].records) {
      const month = months.get(String(row.posting_date).slice(0, 7))
      if (month) month[field] += numeric(row.base_net_total)
    }
  }
  return [...months.values()]
}

export function csv(rows: (string | number | null)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let cell = String(value ?? "")
            if (/^[=+\-@\t\r]/.test(cell)) cell = "'" + cell
            return '"' + cell.replaceAll('"', '""') + '"'
          })
          .join(",")
      )
      .join("\r\n")
  )
}
