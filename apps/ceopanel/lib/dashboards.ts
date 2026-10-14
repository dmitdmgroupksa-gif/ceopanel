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
    description: "Track dispatches, deliveries, and logistics activity.",
    metrics: [
      "Dispatches",
      "Completed deliveries",
      "Pending deliveries",
      "Delayed deliveries",
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
    description: "Keep company approvals and decisions in view.",
    metrics: ["Pending approvals", "Approved", "Rejected", "Overdue approvals"],
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
    description: "Follow team tasks, deadlines, and completion.",
    metrics: [
      "Open tasks",
      "Completed tasks",
      "Overdue tasks",
      "Completion rate",
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
    id: "crm",
    title: "CRM Dashboard",
    icon: "crm",
    description: "Review leads, opportunities, and customer relationships.",
    metrics: ["Leads", "Opportunities", "Pipeline value", "Won opportunities"],
    chart: "CRM pipeline",
    columns: ["Opportunity", "Customer", "Owner", "Value", "Stage"],
  },
] as const

export type DashboardDefinition = (typeof dashboards)[number]
export type DashboardId = DashboardDefinition["id"]
export type MetricValue = {
  label: string
  value: string | number | null
  format?: "number" | "currency" | "percent"
  note?: string
}
export type DashboardData = {
  dashboardId: DashboardId
  status: "awaiting-data" | "ready"
  company: string | null
  period: Period
  currency: string
  updatedAt: string | null
  metrics: MetricValue[]
  chart: {
    title: string
    series: { key: string; label: string }[]
    points: { label: string; [series: string]: string | number }[]
  }
  table: {
    columns: { key: string; label: string }[]
    rows: { id: string; [field: string]: string | number | null }[]
  }
}

export function findDashboard(id: string) {
  return dashboards.find((dashboard) => dashboard.id === id)
}

export function emptyDashboard(
  definition: DashboardDefinition,
  today: string,
  days = 90,
  company: string | null = null
): DashboardData {
  return {
    dashboardId: definition.id,
    status: "awaiting-data",
    company,
    period: makePeriod(days, today),
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
