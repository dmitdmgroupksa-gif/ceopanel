export const agents = [
  {
    id: "sales",
    name: "Sales",
    ar: "المبيعات",
    department: "Sales",
    modules: ["customers", "leads", "quotations", "sales-orders"],
    description: "Customer insights, quotations, orders and follow-up reports.",
    descriptionAr: "رؤى العملاء وعروض الأسعار والطلبات ومقترحات المتابعة.",
  },
  {
    id: "finance",
    name: "Finance",
    ar: "المالية",
    department: "Finance",
    modules: ["invoices", "expenses"],
    description:
      "Invoices, collections and evidence-backed financial analysis.",
    descriptionAr: "الفواتير والتحصيل والتحليل المالي المدعوم بالمصادر.",
  },
  {
    id: "inventory",
    name: "Inventory",
    ar: "المخزون",
    department: "Inventory",
    modules: ["items", "stock"],
    description: "Stock levels, warehouse movements and shortages.",
    descriptionAr: "متابعة المستودعات والنواقص ومقترحات المخزون.",
  },
  {
    id: "procurement",
    name: "Procurement",
    ar: "المشتريات",
    department: "Procurement",
    modules: ["purchase-orders"],
    description: "Supplier purchasing insights, orders and approval status.",
    descriptionAr: "رؤى مشتريات الموردين ومسودات أوامر الشراء.",
  },
  {
    id: "logistics",
    name: "Logistics",
    ar: "الخدمات اللوجستية",
    department: "Logistics",
    modules: ["delivery-notes"],
    description: "Deliveries, dispatch summaries and approval status.",
    descriptionAr: "عمليات التسليم وملخصات الإرسال ومقترحات التعيين.",
  },
  {
    id: "hr",
    name: "HR",
    ar: "الموارد البشرية",
    department: "HR",
    modules: ["employees", "attendance", "payroll", "expenses"],
    description:
      "Permission-controlled people, attendance and payroll assistance.",
    descriptionAr: "مساعدة الموظفين والحضور والرواتب وفق الصلاحيات.",
  },
  {
    id: "facilities",
    name: "Facilities",
    ar: "المرافق",
    department: "Facilities",
    modules: [],
    description: "Maintenance and work orders from permitted ERP records.",
    descriptionAr: "الصيانة وأوامر العمل من أنواع المستندات المخصصة المعتمدة.",
  },
  {
    id: "executive",
    name: "Executive",
    ar: "الإدارة التنفيذية",
    department: "Executive",
    modules: ["projects"],
    description: "Cross-department briefings, KPIs, risks and recommendations.",
    descriptionAr: "ملخصات الإدارات ومؤشرات الأداء والمخاطر والتوصيات.",
  },
] as const
export type AgentId = (typeof agents)[number]["id"]
export type ProposalStatus =
  | "pending"
  | "rejected"
  | "executing"
  | "executed"
  | "needs_reconciliation"
export type Proposal = {
  id: string
  agent: AgentId
  department: string
  company: string
  proposer: string
  status: ProposalStatus
  revision: number
  payload: ActionPayload
  evidence: unknown[]
  created_at: string
  approver?: string
  result?: unknown
}
export type ActionPayload = {
  kind: "create" | "update" | "workflow" | "message"
  module: string
  name?: string
  modified?: string
  values?: Record<string, unknown>
  action?: string
  channel?: "email" | "whatsapp"
  recipient?: string
  text?: string
}
