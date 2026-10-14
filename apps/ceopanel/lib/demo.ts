import {
  makePeriod,
  type ERPDocument,
  type Snapshot,
  type SourceKey,
} from "./model"

export function demoSnapshot(
  today: string,
  days = 90,
  siteUrl = "https://dmgroup.frappe.cloud",
  timezone = "Asia/Riyadh",
  company = "Durar Masagh"
): Snapshot {
  const period = makePeriod(days, today)
  const ago = (count: number) => {
    const date = new Date(`${today}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() - count)
    return date.toISOString().slice(0, 10)
  }
  const invoices = (purchase = false): ERPDocument[] =>
    Array.from({ length: 28 }, (_, index) => ({
      name: `${purchase ? "PINV" : "SINV"}-PREVIEW-${String(index + 1).padStart(4, "0")}`,
      posting_date: ago(index * 3),
      due_date: ago(index * 3 - 25),
      status: index % 3 === 0 ? "Paid" : index > 9 ? "Overdue" : "Unpaid",
      [purchase ? "supplier_name" : "customer_name"]:
        `${purchase ? "Supplier" : "Customer"} ${(index % 6) + 1} (preview)`,
      base_net_total: (purchase ? 14000 : 23000) + ((index * 13729) % 55000),
      outstanding_amount:
        index % 3 === 0
          ? 0
          : (purchase ? 6000 : 11000) + ((index * 3371) % 25000),
      conversion_rate: 1,
    }))
  const sales = invoices()
  const purchases = invoices(true)
  const raw: Record<SourceKey, ERPDocument[]> = {
    salesInvoices: sales.filter(
      (row) => String(row.posting_date) >= period.from
    ),
    receivables: sales.filter((row) => Number(row.outstanding_amount) > 0),
    purchaseInvoices: purchases.filter(
      (row) => String(row.posting_date) >= period.from
    ),
    payables: purchases.filter((row) => Number(row.outstanding_amount) > 0),
    salesOrders: Array.from({ length: 9 }, (_, i) => ({
      name: `SO-PREVIEW-${1001 + i}`,
      customer_name: `Customer ${(i % 6) + 1} (preview)`,
      transaction_date: ago(i * 2),
      delivery_date: ago(i - 10),
      status: i % 2 ? "To Deliver" : "To Deliver and Bill",
      base_net_total: 75000 + i * 17400,
      per_delivered: i * 9,
      per_billed: i * 6,
    })),
    purchaseOrders: Array.from({ length: 7 }, (_, i) => ({
      name: `PO-PREVIEW-${1001 + i}`,
      supplier_name: `Supplier ${(i % 5) + 1} (preview)`,
      transaction_date: ago(i * 3),
      schedule_date: ago(i - 6),
      status: "To Receive and Bill",
      base_net_total: 42000 + i * 8700,
      per_received: i * 12,
      per_billed: i * 10,
    })),
    projects: [
      "Head office fit-out",
      "Warehouse expansion",
      "Operations improvement",
      "Branch launch",
      "Customer portal",
    ].map((name, i) => ({
      name: `PROJ-PREVIEW-${1001 + i}`,
      project_name: `${name} (preview)`,
      status: i === 3 ? "Completed" : "Open",
      percent_complete: [72, 45, 88, 100, 24][i],
      expected_end_date: ago(i * 12 - 35),
      priority: i % 2 ? "Medium" : "High",
    })),
    employees: Array.from({ length: 14 }, (_, i) => ({
      name: `EMP-PREVIEW-${1001 + i}`,
      employee_name: `Team member ${i + 1} (preview)`,
      department: ["Operations", "Finance", "Sales", "Administration"][i % 4],
      designation: ["Specialist", "Manager", "Coordinator"][i % 3],
      date_of_joining: ago(150 + i * 25),
      status: "Active",
    })),
  }
  return {
    mode: "preview",
    company,
    companies: [{ name: company, default_currency: "SAR" }],
    currency: "SAR",
    siteUrl,
    timezone,
    period,
    syncedAt: null,
    user: null,
    sources: Object.fromEntries(
      Object.entries(raw).map(([key, records]) => [
        key,
        { records, error: null },
      ])
    ) as Snapshot["sources"],
  }
}
