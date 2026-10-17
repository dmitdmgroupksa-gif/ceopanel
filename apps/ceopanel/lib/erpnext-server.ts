import "server-only"
import { cookies } from "next/headers"
import { delegatedSid } from "./mcp/erp-identity"
import { ERPNextClient, ERPNextError, type Filter } from "./erpnext-client"
import { permissionedReader } from "./erp-native/permissioned-reader"
import {
  businessDate,
  makePeriod,
  type Company,
  type Snapshot,
  type SourceKey,
} from "./model"

export { SESSION_COOKIE } from "./auth-navigation"
import { SESSION_COOKIE } from "./auth-navigation"
export const companyName = process.env.COMPANY_NAME || "Durar Masagh"
export const timezone = process.env.BUSINESS_TIMEZONE || "Asia/Riyadh"

export function selectCompany(companies: Company[], selected?: string) {
  const company = selected
    ? companies.find((item) => item.name === selected)
    : (companies.find((item) => item.name === process.env.ERPNEXT_COMPANY) ??
      companies[0])
  if (!company)
    throw new ERPNextError(
      "Your account cannot access the selected ERPNext company.",
      403,
    )
  return company
}

export function siteUrl() {
  const url = new URL(process.env.ERPNEXT_URL || "https://dmgroup.frappe.cloud")
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new ERPNextError(
      "ERPNext configuration requires an HTTPS site origin.",
      500,
    )
  }
  return url.origin
}

export async function client() {
  const sid = delegatedSid() || (await cookies()).get(SESSION_COOKIE)?.value
  if (!sid || !/^[A-Za-z0-9_-]+$/.test(sid))
    throw new ERPNextError("Please sign in to ERPNext.", 401)
  return new ERPNextClient(siteUrl(), sid)
}

export async function loadSnapshot(
  days: number,
  selectedCompany?: string,
): Promise<Snapshot> {
  const erp = await client()
  const user = await erp.user()
  const companies = await erp.list<Company>("Company", {
    fields: ["name", "default_currency"],
  })
  const company = selectCompany(companies, selectedCompany)
  const period = makePeriod(days, businessDate(new Date(), timezone))
  const reader = permissionedReader(erp, {
    user,
    company: company.name,
    currency: company.default_currency || "SAR",
    companies,
    siteUrl: siteUrl(),
  })
  const companyFilter: Filter[] = [["company", "=", company.name]]
  const submitted: Filter[] = [...companyFilter, ["docstatus", "=", 1]]
  const dated: Filter[] = [
    ...submitted,
    ["posting_date", ">=", period.from],
    ["posting_date", "<=", period.to],
  ]
  const invoiceFields = [
    "name",
    "posting_date",
    "due_date",
    "status",
    "base_net_total",
    "outstanding_amount",
    "conversion_rate",
  ]
  const queries: Record<
    SourceKey,
    { doctype: string; fields: string[]; filters: Filter[] }
  > = {
    salesInvoices: {
      doctype: "Sales Invoice",
      fields: [...invoiceFields, "customer_name"],
      filters: dated,
    },
    receivables: {
      doctype: "Sales Invoice",
      fields: [...invoiceFields, "customer_name"],
      filters: [...submitted, ["outstanding_amount", "!=", 0]],
    },
    purchaseInvoices: {
      doctype: "Purchase Invoice",
      fields: [...invoiceFields, "supplier_name"],
      filters: dated,
    },
    payables: {
      doctype: "Purchase Invoice",
      fields: [...invoiceFields, "supplier_name"],
      filters: [...submitted, ["outstanding_amount", "!=", 0]],
    },
    salesOrders: {
      doctype: "Sales Order",
      fields: [
        "name",
        "customer_name",
        "transaction_date",
        "delivery_date",
        "status",
        "base_net_total",
        "per_delivered",
        "per_billed",
      ],
      filters: [
        ...submitted,
        ["status", "not in", ["Closed", "Completed", "Cancelled"]],
      ],
    },
    purchaseOrders: {
      doctype: "Purchase Order",
      fields: [
        "name",
        "supplier_name",
        "transaction_date",
        "schedule_date",
        "status",
        "base_net_total",
        "per_received",
        "per_billed",
      ],
      filters: [
        ...submitted,
        ["status", "not in", ["Closed", "Completed", "Cancelled"]],
      ],
    },
    projects: {
      doctype: "Project",
      fields: [
        "name",
        "project_name",
        "status",
        "percent_complete",
        "expected_end_date",
        "priority",
      ],
      filters: companyFilter,
    },
    employees: {
      doctype: "Employee",
      fields: [
        "name",
        "employee_name",
        "department",
        "designation",
        "date_of_joining",
        "status",
      ],
      filters: [...companyFilter, ["status", "=", "Active"]],
    },
  }
  const entries = await Promise.all(
    Object.entries(queries).map(async ([key, query]) => {
      try {
        const records = await reader.list(query.doctype, {
          ...query,
          fields: [...new Set(["company", ...query.fields])],
        })
        if (records.some((row) => row.company !== company.name))
          throw new ERPNextError(
            "ERPNext returned records for a different company.",
            403,
          )
        return [key, { records, error: null }] as const
      } catch (error) {
        if (error instanceof ERPNextError && error.status === 401) throw error
        return [
          key,
          {
            records: [],
            error:
              error instanceof ERPNextError
                ? error.message
                : "These records could not be loaded.",
          },
        ] as const
      }
    }),
  )
  return {
    mode: "live",
    company: company.name,
    companies,
    currency: company.default_currency || "SAR",
    siteUrl: siteUrl(),
    timezone,
    period,
    syncedAt: new Date().toISOString(),
    user,
    sources: Object.fromEntries(entries) as Snapshot["sources"],
  }
}

export function validOrigin(request: Request) {
  // Browser POSTs must originate from this app; credentials are never accepted cross-site.
  const origin = request.headers.get("origin")
  return (
    origin !== null &&
    origin === (process.env.CEOPANEL_ORIGIN || new URL(request.url).origin)
  )
}
