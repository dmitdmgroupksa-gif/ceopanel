import {
  ERPNextError,
  type ERPNextClient,
  type Filter,
} from "../erpnext-client"
import type { DashboardContext } from "../dashboard-server"
import type { DashboardData, DashboardId, MetricValue } from "../dashboards"
import type { ERPDocument, Period } from "../model"
import { operationalDashboardIds } from "./operations-dashboards"
import { inventoryDashboardIds } from "./inventory-dashboard"
import { erpDate } from "./date"

export const nativeDashboardIds = [
  "sales-comparison",
  "quotation-team",
  "sales-operation",
  "purchase",
  "hr",
  "attendance",
  "payments-collections",
  "ar",
  "stock",
  "crm",
] as const satisfies readonly DashboardId[]
export function isNativeDashboard(id: string) {
  return (
    nativeDashboardIds.some((value) => value === id) ||
    operationalDashboardIds.some((value) => value === id) ||
    inventoryDashboardIds.some((value) => value === id)
  )
}

function day(value: string, offset: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}
function number(row: ERPDocument, field: string) {
  const value = row[field]
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim()) ||
    !Number.isFinite(Number(value))
  )
    throw new ERPNextError(
      "A required ERP number is unavailable. Totals cannot be calculated.",
    )
  return Number(value)
}
const total = (rows: ERPDocument[], field: string) => {
  const value = rows.reduce((sum, row) => sum + number(row, field), 0)
  if (!Number.isFinite(value))
    throw new ERPNextError("ERP totals exceed the supported range.")
  return value
}
const text = (row: ERPDocument, field: string) => String(row[field] ?? "")
const metric = (
  label: string,
  value: number | null,
  format: MetricValue["format"] = "number",
): MetricValue => ({ label, value, format })
function table(
  rows: ERPDocument[],
  columns: [string, string][],
  transform?: (row: ERPDocument) => Record<string, string | number | null>,
) {
  return {
    columns: columns.map(([key, label]) => ({ key, label })),
    rows: rows.map((row) => ({
      id: row.name,
      ...Object.fromEntries(columns.map(([key]) => [key, row[key] ?? null])),
      ...transform?.(row),
    })),
  }
}
function trend(period: Period, series: [string, string][]) {
  const points = Array.from({ length: period.days }, (_, index) => ({
    label: day(period.from, index),
    ...Object.fromEntries(series.map(([key]) => [key, 0])),
  })) as { label: string; [key: string]: string | number }[]
  const byDate = new Map(points.map((point) => [point.label, point]))
  return {
    add(date: string, key: string, value = 1) {
      const point = byDate.get(date.slice(0, 10))
      if (point) point[key] = Number(point[key]) + value
    },
    chart: {
      title: "Activity by date",
      series: series.map(([key, label]) => ({ key, label })),
      points,
    },
  }
}

export async function nativeDashboard(
  erp: {
    list: (
      doctype: string,
      query: Parameters<ERPNextClient["list"]>[1],
    ) => Promise<ERPDocument[]>
  },
  id: DashboardId,
  context: DashboardContext,
  period: Period,
): Promise<DashboardData> {
  if (!nativeDashboardIds.some((value) => value === id))
    throw new ERPNextError("Dashboard not connected.", 409)
  const base: DashboardData = {
    dashboardId: id,
    status: "ready",
    company: context.company,
    period,
    currency: context.currency,
    updatedAt: null,
    metrics: [],
    chart: { title: "", series: [], points: [] },
    table: { columns: [], rows: [] },
  }
  async function read(doctype: string, fields: string[], filters: Filter[]) {
    const rows = await erp.list(doctype, {
      fields: [...new Set(["name", "company", "docstatus", ...fields])],
      filters: [["company", "=", context.company], ...filters],
      orderBy: "name asc",
    })
    if (
      rows.some(
        (row) =>
          !row ||
          typeof row.name !== "string" ||
          row.company !== context.company,
      )
    )
      throw new ERPNextError(
        "ERPNext returned records for a different company.",
        403,
      )
    if (new Set(rows.map((row) => row.name)).size !== rows.length)
      throw new ERPNextError(
        "ERPNext returned duplicate records. Refresh before using these totals.",
      )
    for (const field of [
      "posting_date",
      "transaction_date",
      "attendance_date",
      "creation",
    ].filter((field) => fields.includes(field)))
      if (rows.some((row) => !erpDate(row[field])))
        throw new ERPNextError(
          "A required ERP date is unavailable. This dashboard cannot be calculated.",
        )
    for (const [field, operator, value] of filters) {
      if (
        field === "docstatus" &&
        operator === "=" &&
        rows.some((row) => row.docstatus !== value)
      )
        throw new ERPNextError(
          "ERP returned records outside the requested submission state.",
          409,
        )
      if (
        [
          "posting_date",
          "transaction_date",
          "attendance_date",
          "creation",
        ].includes(field) &&
        [">=", "<="].includes(operator)
      ) {
        const boundary = erpDate(value)!
        if (
          rows.some((row) => {
            const value = erpDate(row[field])
            return (
              !value ||
              (operator === ">=" ? value < boundary : value > boundary)
            )
          })
        )
          throw new ERPNextError(
            "ERP returned records outside the requested reporting period.",
            409,
          )
      }
    }
    for (const field of [
      "due_date",
      "valid_till",
      "date_of_joining",
      "delivery_date",
      "schedule_date",
    ].filter((field) => fields.includes(field)))
      rows.forEach((row) => erpDate(row[field]))
    return rows
  }
  const submitted: Filter[] = [["docstatus", "=", 1]]
  const dated = (
    field: string,
    from = period.from,
    to = period.to,
  ): Filter[] => [
    [field, ">=", from],
    [field, "<=", to],
  ]

  if (id === "sales-comparison") {
    const previousFrom = day(period.from, -period.days)
    const rows = await read(
      "Sales Invoice",
      ["posting_date", "customer_name", "base_net_total", "status"],
      [...submitted, ...dated("posting_date", previousFrom)],
    )
    const current = rows.filter(
      (row) => text(row, "posting_date") >= period.from,
    )
    const previous = rows.filter(
      (row) => text(row, "posting_date") < period.from,
    )
    const currentTotal = total(current, "base_net_total"),
      previousTotal = total(previous, "base_net_total")
    base.metrics = [
      metric("Current period sales", currentTotal, "currency"),
      metric("Previous period sales", previousTotal, "currency"),
      metric("Difference", currentTotal - previousTotal, "currency"),
      metric(
        "Change",
        previousTotal === 0
          ? null
          : ((currentTotal - previousTotal) / Math.abs(previousTotal)) * 100,
        "percent",
      ),
    ]
    if (!previousTotal) base.metrics[3].note = "No prior-period baseline"
    const activity = trend(period, [
      ["current", "Current period"],
      ["previous", "Previous period"],
    ])
    for (const row of current)
      activity.add(
        text(row, "posting_date"),
        "current",
        number(row, "base_net_total"),
      )
    for (const row of previous)
      activity.add(
        day(text(row, "posting_date"), period.days),
        "previous",
        number(row, "base_net_total"),
      )
    base.chart = { ...activity.chart, title: "Invoice net sales" }
    base.table = table(current, [
      ["name", "Invoice"],
      ["customer_name", "Customer"],
      ["posting_date", "Date"],
      ["base_net_total", "Net sales"],
      ["status", "Status"],
    ])
    base.note =
      "Submitted invoice net sales in company currency, including returns. Compared with the preceding equal-length period."
  } else if (id === "sales-operation" || id === "purchase") {
    const sales = id === "sales-operation"
    const fulfilment = sales ? "per_delivered" : "per_received"
    const party = sales ? "customer_name" : "supplier_name"
    const due = sales ? "delivery_date" : "schedule_date"
    const rows = await read(
      sales ? "Sales Order" : "Purchase Order",
      [
        party,
        "transaction_date",
        due,
        "status",
        "base_net_total",
        fulfilment,
        "per_billed",
      ],
      [...submitted, ...dated("transaction_date")],
    )
    const open = rows.filter(
      (row) =>
        !["Closed", "Completed", "Cancelled"].includes(text(row, "status")),
    )
    base.metrics = [
      metric(sales ? "Sales orders" : "Purchase orders", rows.length),
      metric(
        sales ? "Order value" : "Purchase value",
        total(rows, "base_net_total"),
        "currency",
      ),
      metric(
        sales ? "Pending delivery" : "Pending receipt",
        open.filter((row) => number(row, fulfilment) < 100).length,
      ),
      metric(
        "Pending billing",
        open.filter((row) => number(row, "per_billed") < 100).length,
      ),
    ]
    const activity = trend(period, [["value", "Net order value"]])
    rows.forEach((row) =>
      activity.add(
        text(row, "transaction_date"),
        "value",
        number(row, "base_net_total"),
      ),
    )
    base.chart = {
      ...activity.chart,
      title: sales ? "Sales orders by date" : "Purchase orders by date",
    }
    base.table = table(rows, [
      ["name", sales ? "Sales order" : "Purchase order"],
      [party, sales ? "Customer" : "Supplier"],
      ["transaction_date", "Date"],
      [due, sales ? "Delivery date" : "Required date"],
      ["base_net_total", "Net value"],
      ["status", "Status"],
    ])
    base.note =
      "Submitted orders dated within this period. Pending counts exclude closed and completed orders; amounts exclude tax and use company currency."
  } else if (id === "quotation-team") {
    const rows = await read(
      "Quotation",
      [
        "party_name",
        "transaction_date",
        "valid_till",
        "base_net_total",
        "status",
      ],
      [...submitted, ...dated("transaction_date")],
    )
    base.metrics = [
      metric("Submitted quotations", rows.length),
      metric("Quoted value", total(rows, "base_net_total"), "currency"),
      metric(
        "Ordered quotations",
        rows.filter((row) =>
          ["Ordered", "Partially Ordered"].includes(text(row, "status")),
        ).length,
      ),
      metric(
        "Expired quotations",
        rows.filter((row) => row.status === "Expired").length,
      ),
    ]
    const activity = trend(period, [["value", "Quoted net value"]])
    rows.forEach((row) =>
      activity.add(
        text(row, "transaction_date"),
        "value",
        number(row, "base_net_total"),
      ),
    )
    base.chart = { ...activity.chart, title: "Quotation value by date" }
    base.table = table(rows, [
      ["name", "Quotation"],
      ["party_name", "Customer or lead"],
      ["transaction_date", "Date"],
      ["valid_till", "Valid until"],
      ["base_net_total", "Net value"],
      ["status", "Status"],
    ])
    base.note =
      "Submitted quotations dated within this period. Amounts exclude tax and use company currency."
  } else if (id === "hr") {
    const rows = await read(
      "Employee",
      [
        "employee_name",
        "department",
        "designation",
        "date_of_joining",
        "status",
      ],
      [],
    )
    const active = rows.filter((row) => row.status === "Active")
    base.metrics = [
      metric("Active employees", active.length),
      metric(
        "Joined this period",
        rows.filter(
          (row) =>
            text(row, "date_of_joining") >= period.from &&
            text(row, "date_of_joining") <= period.to,
        ).length,
      ),
      metric(
        "Departments",
        new Set(active.map((row) => text(row, "department")).filter(Boolean))
          .size,
      ),
      metric("Other employee statuses", rows.length - active.length),
    ]
    const departments = new Map<string, number>()
    active.forEach((row) => {
      const key = text(row, "department") || "Unassigned"
      departments.set(key, (departments.get(key) ?? 0) + 1)
    })
    base.chart = {
      title: "Active employees by department",
      series: [{ key: "employees", label: "Employees" }],
      points: [...departments].map(([label, employees]) => ({
        label,
        employees,
      })),
    }
    base.table = table(rows, [
      ["name", "Employee ID"],
      ["employee_name", "Employee"],
      ["department", "Department"],
      ["designation", "Role"],
      ["date_of_joining", "Joined"],
      ["status", "Status"],
    ])
    base.note =
      "Current employee status. The selected period applies to joining dates only."
  } else if (id === "attendance") {
    const rows = await read(
      "Attendance",
      [
        "employee",
        "employee_name",
        "department",
        "attendance_date",
        "status",
        "working_hours",
      ],
      [...submitted, ...dated("attendance_date")],
    )
    base.metrics = [
      metric("Attendance records", rows.length),
      metric("Present", rows.filter((row) => row.status === "Present").length),
      metric("Absent", rows.filter((row) => row.status === "Absent").length),
      metric(
        "On leave",
        rows.filter((row) => row.status === "On Leave").length,
      ),
    ]
    const activity = trend(period, [
      ["present", "Present"],
      ["absent", "Absent"],
      ["leave", "On leave"],
    ])
    const keys: Record<string, string> = {
      Present: "present",
      Absent: "absent",
      "On Leave": "leave",
    }
    for (const row of rows)
      if (keys[text(row, "status")])
        activity.add(text(row, "attendance_date"), keys[text(row, "status")])
    base.chart = { ...activity.chart, title: "Attendance by date" }
    base.table = table(rows, [
      ["name", "Attendance"],
      ["employee_name", "Employee"],
      ["department", "Department"],
      ["attendance_date", "Date"],
      ["working_hours", "Hours"],
      ["status", "Status"],
    ])
    base.note =
      "Submitted attendance records. Half-day and work-from-home records remain visible in the table; no attendance rate is inferred."
  } else if (id === "payments-collections") {
    const rows = await read(
      "Payment Entry",
      [
        "posting_date",
        "party_name",
        "payment_type",
        "base_paid_amount",
        "base_received_amount",
        "status",
      ],
      [...submitted, ...dated("posting_date")],
    )
    const receipts = rows.filter((row) => row.payment_type === "Receive"),
      payments = rows.filter((row) => row.payment_type === "Pay")
    base.metrics = [
      metric(
        "Collections",
        total(receipts, "base_received_amount"),
        "currency",
      ),
      metric("Payments", total(payments, "base_paid_amount"), "currency"),
      metric("Receipt entries", receipts.length),
      metric("Payment entries", payments.length),
    ]
    const activity = trend(period, [
      ["collections", "Collections"],
      ["payments", "Payments"],
    ])
    receipts.forEach((row) =>
      activity.add(
        text(row, "posting_date"),
        "collections",
        number(row, "base_received_amount"),
      ),
    )
    payments.forEach((row) =>
      activity.add(
        text(row, "posting_date"),
        "payments",
        number(row, "base_paid_amount"),
      ),
    )
    base.chart = { ...activity.chart, title: "Payments and collections" }
    base.table = table(rows, [
      ["name", "Payment entry"],
      ["party_name", "Party"],
      ["posting_date", "Date"],
      ["payment_type", "Type"],
      ["base_paid_amount", "Paid amount"],
      ["base_received_amount", "Received amount"],
    ])
    base.note =
      "Submitted payment entries in company currency. Internal transfers are excluded from payment and collection totals."
  } else if (id === "ar") {
    const rows = await read(
      "Sales Invoice",
      [
        "customer",
        "customer_name",
        "posting_date",
        "due_date",
        "outstanding_amount",
        "conversion_rate",
        "status",
      ],
      [
        ...submitted,
        ["posting_date", "<=", period.to],
        ["outstanding_amount", ">", 0],
      ],
    )
    const outstanding = (row: ERPDocument) => {
      const rate = number(row, "conversion_rate")
      if (rate <= 0)
        throw new ERPNextError(
          "An invoice exchange rate is invalid. Totals cannot be calculated.",
        )
      const value = number(row, "outstanding_amount") * rate
      if (!Number.isFinite(value))
        throw new ERPNextError(
          "An invoice balance exceeds the supported range.",
        )
      return value
    }
    const age = (row: ERPDocument) => {
      const due = erpDate(row.due_date)
      if (!due) return null
      return Math.max(
        0,
        Math.floor(
          (Date.parse(`${period.to}T00:00:00Z`) -
            Date.parse(`${due}T00:00:00Z`)) /
            86400000,
        ),
      )
    }
    base.metrics = [
      metric(
        "Unpaid invoice balance",
        rows.reduce((sum, row) => sum + outstanding(row), 0),
        "currency",
      ),
      metric(
        "Overdue invoice balance",
        rows
          .filter((row) => (age(row) ?? 0) > 0)
          .reduce((sum, row) => sum + outstanding(row), 0),
        "currency",
      ),
      metric("Invoices with balances", rows.length),
      metric(
        "Customers with balances",
        new Set(rows.map((row) => text(row, "customer"))).size,
      ),
    ]
    const buckets = new Map(
      [
        "Not overdue",
        "1–30 days",
        "31–60 days",
        "61–90 days",
        "Over 90 days",
        "Unknown due date",
      ].map((label) => [label, 0]),
    )
    rows.forEach((row) => {
      const days = age(row)
      const label =
        days === null
          ? "Unknown due date"
          : days === 0
            ? "Not overdue"
            : days <= 30
              ? "1–30 days"
              : days <= 60
                ? "31–60 days"
                : days <= 90
                  ? "61–90 days"
                  : "Over 90 days"
      buckets.set(label, buckets.get(label)! + outstanding(row))
    })
    base.chart = {
      title: "Unpaid invoice aging",
      series: [{ key: "balance", label: "Invoice balance" }],
      points: [...buckets].map(([label, balance]) => ({ label, balance })),
    }
    base.table = table(
      rows,
      [
        ["name", "Invoice"],
        ["customer_name", "Customer"],
        ["due_date", "Due date"],
        ["balance", "Company-currency balance"],
        ["days", "Days overdue"],
      ],
      (row) => ({ balance: outstanding(row), days: age(row) }),
    )
    base.note =
      "Current positive invoice balances in company currency. Unallocated payments and credit balances are excluded. The period filter does not reconstruct historical receivables."
  } else if (id === "stock") {
    const rows = await read(
      "Stock Entry",
      [
        "posting_date",
        "stock_entry_type",
        "total_incoming_value",
        "total_outgoing_value",
      ],
      [...submitted, ...dated("posting_date")],
    )
    base.metrics = [
      metric("Stock entries", rows.length),
      metric("Incoming value", total(rows, "total_incoming_value"), "currency"),
      metric("Outgoing value", total(rows, "total_outgoing_value"), "currency"),
      metric(
        "Entry types",
        new Set(rows.map((row) => text(row, "stock_entry_type"))).size,
      ),
    ]
    const activity = trend(period, [
      ["incoming", "Incoming value"],
      ["outgoing", "Outgoing value"],
    ])
    rows.forEach((row) => {
      activity.add(
        text(row, "posting_date"),
        "incoming",
        number(row, "total_incoming_value"),
      )
      activity.add(
        text(row, "posting_date"),
        "outgoing",
        number(row, "total_outgoing_value"),
      )
    })
    base.chart = { ...activity.chart, title: "Stock movements by date" }
    base.table = table(rows, [
      ["name", "Stock entry"],
      ["stock_entry_type", "Type"],
      ["posting_date", "Date"],
      ["total_incoming_value", "Incoming value"],
      ["total_outgoing_value", "Outgoing value"],
    ])
    base.note =
      "Submitted stock-entry movements in company currency. These values are not current stock availability or warehouse valuation."
  } else if (id === "crm") {
    const [leads, opportunities] = await Promise.all([
      read(
        "Lead",
        ["lead_name", "creation", "status"],
        [
          ["creation", ">=", `${period.from} 00:00:00`],
          ["creation", "<", `${day(period.to, 1)} 00:00:00`],
        ],
      ),
      read(
        "Opportunity",
        ["party_name", "transaction_date", "status"],
        [...dated("transaction_date"), ["docstatus", "!=", 2]],
      ),
    ])
    base.metrics = [
      metric("Leads", leads.length),
      metric(
        "Open opportunities",
        opportunities.filter((row) =>
          ["Open", "Quotation", "Replied"].includes(text(row, "status")),
        ).length,
      ),
      metric(
        "Converted opportunities",
        opportunities.filter((row) => row.status === "Converted").length,
      ),
      metric(
        "Lost opportunities",
        opportunities.filter((row) => row.status === "Lost").length,
      ),
    ]
    const activity = trend(period, [
      ["leads", "Leads"],
      ["opportunities", "Opportunities"],
    ])
    leads.forEach((row) => activity.add(text(row, "creation"), "leads"))
    opportunities.forEach((row) =>
      activity.add(text(row, "transaction_date"), "opportunities"),
    )
    base.chart = { ...activity.chart, title: "Leads and opportunities by date" }
    base.table = table(opportunities, [
      ["name", "Opportunity"],
      ["party_name", "Customer or lead"],
      ["transaction_date", "Date"],
      ["status", "Status"],
    ])
    base.note =
      "Leads created and opportunities dated within this period. Opportunity counts use current statuses."
  }
  if (
    base.metrics.some(
      (metric) =>
        typeof metric.value === "number" && !Number.isFinite(metric.value),
    ) ||
    base.chart.points.some((point) =>
      base.chart.series.some(
        (series) => !Number.isFinite(Number(point[series.key])),
      ),
    )
  )
    throw new ERPNextError("ERP totals exceed the supported range.")
  base.note = `${base.note} Figures reflect records visible to your ERP account.`
  base.updatedAt = new Date().toISOString()
  return base
}
