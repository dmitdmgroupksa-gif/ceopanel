import { makePeriod, type Period } from "./model"

// Labels define editable layout slots, not data sources or calculation rules.
export const dashboards = [
  {
    id: "sales-comparison",
    title: "Sales Comparison",
    icon: "comparison",
    description: "Compare sales performance across periods and teams.",
    metrics: [
      "Current period sales",
      "Previous period sales",
      "Difference",
      "Change",
    ],
    chart: "Sales comparison",
    columns: ["Period", "Team", "Current sales", "Previous sales", "Change"],
  },
  {
    id: "quotation-team",
    title: "Quotation Team Dashboard",
    icon: "quotations",
    description: "Review team quotations and their progress.",
    metrics: [
      "Quotations",
      "Quotation value",
      "Accepted quotations",
      "Conversion rate",
    ],
    chart: "Quotation performance",
    columns: ["Quotation", "Team", "Customer", "Value", "Status"],
  },
  {
    id: "management-insights",
    title: "Management Insights",
    icon: "insights",
    description: "Company insights for management decisions.",
    metrics: ["Revenue", "Operating costs", "Profit", "Cash position"],
    chart: "Company performance",
    columns: ["Insight", "Business area", "Period", "Value", "Status"],
  },
  {
    id: "payments-collections",
    title: "Payments & Collections",
    icon: "payments",
    description: "Monitor payments, collections, and outstanding balances.",
    metrics: [
      "Collections",
      "Payments",
      "Outstanding receivables",
      "Outstanding payables",
    ],
    chart: "Payments and collections",
    columns: ["Reference", "Party", "Date", "Amount", "Status"],
  },
  {
    id: "hr",
    title: "HR Dashboard",
    icon: "hr",
    description: "An overview of your people and HR activity.",
    metrics: ["Employees", "New hires", "Open positions", "HR requests"],
    chart: "HR activity",
    columns: ["Employee", "Department", "Role", "Joined", "Status"],
  },
  {
    id: "metabase-analytics",
    title: "Metabase Analytics",
    icon: "analytics",
    description: "Your company's analytics dashboards and reports.",
    metrics: ["Dashboards", "Reports", "Connected sources", "Last update"],
    chart: "Analytics overview",
    columns: ["Dashboard", "Business area", "Owner", "Updated", "Status"],
  },
  {
    id: "management-reports",
    title: "Management Reports",
    icon: "reports",
    description: "Management reporting across company functions.",
    metrics: [
      "Management reports",
      "Reports ready",
      "Reports pending",
      "Last update",
    ],
    chart: "Management reporting",
    columns: ["Report", "Business area", "Period", "Updated", "Status"],
  },
  {
    id: "dispatch-logistics",
    title: "Dispatch & Logistics",
    icon: "logistics",
    description:
      "Submitted delivery trips, vehicles and recorded delivery status.",
    metrics: [
      "Delivery trips",
      "Completed trips",
      "In transit",
      "Past scheduled date",
    ],
    chart: "Delivery performance",
    columns: ["Dispatch", "Customer", "Delivery date", "Destination", "Status"],
  },
  {
    id: "attendance",
    title: "Attendance Dashboard",
    icon: "attendance",
    description: "Review attendance across teams and departments.",
    metrics: ["Employees expected", "Present", "Absent", "Attendance rate"],
    chart: "Attendance overview",
    columns: ["Employee", "Department", "Date", "Hours", "Status"],
  },
  {
    id: "approvals",
    title: "Approvals Dashboard",
    icon: "approvals",
    scope: "erp-account",
    window: "history",
    description:
      "Visible ERP requests with further workflow steps and candidate roles.",
    metrics: [
      "Requests with next steps",
      "Draft documents",
      "Submitted documents",
      "Workflow types",
    ],
    chart: "Approval activity",
    columns: ["Request", "Requested by", "Type", "Submitted", "Status"],
  },
  {
    id: "purchase",
    title: "Purchase Dashboard",
    icon: "purchase",
    description: "Review purchasing activity and supplier commitments.",
    metrics: [
      "Purchase orders",
      "Purchase value",
      "Received orders",
      "Pending receipt",
    ],
    chart: "Purchase performance",
    columns: ["Purchase order", "Supplier", "Date", "Value", "Status"],
  },
  {
    id: "sales-operation",
    title: "Sales Operation",
    icon: "sales",
    description: "Track sales operations, delivery, and billing progress.",
    metrics: [
      "Sales orders",
      "Order value",
      "Pending delivery",
      "Pending billing",
    ],
    chart: "Sales operations",
    columns: ["Sales order", "Customer", "Delivery date", "Value", "Status"],
  },
  {
    id: "tasks",
    title: "Task Dashboard",
    icon: "tasks",
    scope: "erp-account",
    window: "current",
    description: "Custom ERP tasks, assignees and due dates.",
    metrics: [
      "Open tasks",
      "Overdue tasks",
      "Unassigned tasks",
      "Missing due dates",
    ],
    chart: "Task progress",
    columns: ["Task", "Assigned to", "Priority", "Due date", "Status"],
  },
  {
    id: "stock",
    title: "Stock Dashboard",
    icon: "stock",
    description:
      "Stock availability, valuation, and movement across locations.",
    metrics: [
      "Stock value",
      "Available items",
      "Low-stock items",
      "Stock movements",
    ],
    chart: "Stock overview",
    columns: ["Item", "Warehouse", "Available quantity", "Value", "Status"],
  },
  {
    id: "warehouse-stock",
    title: "Warehouse Stock",
    icon: "stock",
    window: "current",
    description:
      "Current nonzero on-hand balances by item and company warehouse.",
    metrics: [
      "On-hand stock value",
      "Item-warehouse balances",
      "Negative stock balances",
      "Reserved above on-hand",
    ],
    chart: "Balances by warehouse",
    columns: [
      "Item",
      "Warehouse",
      "Stock UOM",
      "On hand",
      "Reserved",
      "Projected",
      "Stock value",
      "Status",
    ],
  },
  {
    id: "accounts",
    title: "Accounts Dashboard",
    icon: "accounts",
    description: "Review accounting balances and financial activity.",
    metrics: ["Account balances", "Income", "Expenses", "Cash & bank"],
    chart: "Accounting overview",
    columns: ["Account", "Period", "Debit", "Credit", "Balance"],
  },
  {
    id: "ar",
    title: "AR Dashboard",
    icon: "receivables",
    description: "Accounts receivable balances, aging, and collections.",
    metrics: [
      "Total receivables",
      "Overdue balance",
      "Collections",
      "Customers with balances",
    ],
    chart: "Receivables aging",
    columns: ["Customer", "Invoice", "Due date", "Outstanding", "Age"],
  },
  {
    id: "sales-person",
    title: "Sales Person Dashboard",
    icon: "salespeople",
    description: "Salesperson performance, targets, and activity.",
    metrics: [
      "Sales value",
      "Sales target",
      "Achievement",
      "Active salespeople",
    ],
    chart: "Salesperson performance",
    columns: ["Salesperson", "Team", "Sales", "Target", "Achievement"],
  },
  {
    id: "facilities",
    title: "Facilities & Renewals",
    icon: "facilities",
    window: "upcoming",
    description: "Facility contract, license and rent installment dates.",
    metrics: [
      "Facilities",
      "Expired deadlines",
      "Renewals in window",
      "Unpaid installments due",
    ],
    chart: "Recorded deadlines",
    columns: ["Facility", "Deadline", "Due date", "Status"],
  },
  {
    id: "it-service",
    title: "IT Service",
    icon: "it",
    scope: "erp-account",
    window: "current",
    description: "IT support requests, priorities and technician queues.",
    metrics: [
      "Open tickets",
      "High priority tickets",
      "Unassigned tickets",
      "Due before today",
    ],
    chart: "Tickets by status",
    columns: ["Ticket", "Subject", "Priority", "Status"],
  },
  {
    id: "factory",
    title: "Factory Operations",
    icon: "factory",
    scope: "erp-account",
    window: "current",
    description: "Factory job orders, branches and scheduled completion dates.",
    metrics: [
      "Open job orders",
      "Past end date",
      "Completed job orders",
      "Missing end dates",
    ],
    chart: "Job orders by status",
    columns: ["Job order", "Branch", "Start date", "End date", "Status"],
  },
  {
    id: "crm",
    title: "CRM Dashboard",
    icon: "crm",
    description: "Review leads, opportunities, and customer relationships.",
    metrics: ["Leads", "Opportunities", "Pipeline value", "Won opportunities"],
    chart: "CRM pipeline",
    columns: ["Opportunity", "Customer", "Owner", "Value", "Stage"],
  },
] as const

export type DashboardDefinition = (typeof dashboards)[number] & {
  scope?: "company" | "erp-account"
  window?: "history" | "current" | "upcoming"
}
export type DashboardId = DashboardDefinition["id"]
export type MetricValue = {
  label: string
  value: string | number | null
  format?: "number" | "currency" | "percent"
  note?: string
}
export type DashboardData = {
  scope?: "company" | "erp-account"
  dashboardId: DashboardId
  status: "awaiting-data" | "ready"
  company: string | null
  period: Period
  currency: string
  updatedAt: string | null
  note?: string
  metrics: MetricValue[]
  chart: {
    type?: "area" | "bar"
    title: string
    series: { key: string; label: string }[]
    points: { label: string; [series: string]: string | number }[]
  }
  table: {
    links?: Record<string, string>
    columns: { key: string; label: string }[]
    rows: { id: string; [field: string]: string | number | null }[]
  }
}

export function findDashboard(id: string): DashboardDefinition | undefined {
  return dashboards.find((dashboard) => dashboard.id === id)
}

export function emptyDashboard(
  definition: DashboardDefinition,
  today: string,
  days = 90,
  company: string | null = null,
): DashboardData {
  const period = makePeriod(definition.window === "current" ? 1 : days, today)
  if (definition.window === "upcoming") {
    period.from = today
    period.to = new Date(
      Date.parse(`${today}T00:00:00Z`) + (days - 1) * 86400000,
    )
      .toISOString()
      .slice(0, 10)
  }
  return {
    dashboardId: definition.id,
    status: "awaiting-data",
    company,
    period,
    scope: definition.scope || "company",
    currency: "SAR",
    updatedAt: null,
    metrics: definition.metrics.map((label) => ({ label, value: null })),
    chart: { title: definition.chart, series: [], points: [] },
    table: {
      columns: definition.columns.map((label, index) => ({
        key: `column_${index}`,
        label,
      })),
      rows: [],
    },
  }
}
