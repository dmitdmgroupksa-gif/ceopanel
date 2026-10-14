import "server-only"
import {
  emptyDashboard,
  findDashboard,
  type DashboardData,
  type DashboardId,
} from "./dashboards"
import { client, siteUrl, timezone } from "./erpnext-server"
import { ERPNextError } from "./erpnext-client"
import { businessDate, type Company } from "./model"

export type DashboardContext = {
  user: string
  company: string
  currency: string
  companies: Company[]
  siteUrl: string
}
export async function loadContext(
  selectedCompany?: string
): Promise<DashboardContext> {
  const erp = await client()
  const user = await erp.user()
  const companies = await erp.list<Company>("Company", {
    fields: ["name", "default_currency"],
  })
  const preferred = selectedCompany || process.env.ERPNEXT_COMPANY
  const company = preferred
    ? companies.find((item) => item.name === preferred)
    : companies[0]
  if (!company)
    throw new ERPNextError(
      "Your account cannot access the selected ERPNext company.",
      403
    )
  return {
    user,
    company: company.name,
    currency: company.default_currency || "SAR",
    companies,
    siteUrl: siteUrl(),
  }
}

type Adapter = (
  context: DashboardContext,
  period: DashboardData["period"]
) => Promise<DashboardData>
// Register adapters only after the company provides data sources and definitions.
// Supports ERPNext, Metabase, or another service through the same UI contract.
export const dashboardAdapters: Partial<Record<DashboardId, Adapter>> = {}

export async function loadDashboard(
  id: string,
  days: number,
  selectedCompany?: string
) {
  const definition = findDashboard(id)
  if (!definition) throw new ERPNextError("Dashboard not found.", 404)
  const pending = emptyDashboard(
    definition,
    businessDate(new Date(), timezone),
    days
  )
  const adapter = dashboardAdapters[definition.id]
  // Unmapped dashboards make no business-data requests.
  if (!adapter) return pending
  const context = await loadContext(selectedCompany)
  const result = await adapter(context, pending.period)
  if (
    result.dashboardId !== definition.id ||
    result.company !== context.company
  )
    throw new ERPNextError(
      "Dashboard returned data for a different company or view."
    )
  return result
}
