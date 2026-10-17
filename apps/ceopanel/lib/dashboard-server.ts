import "server-only"
import {
  emptyDashboard,
  findDashboard,
  type DashboardData,
  type DashboardId,
} from "./dashboards"
import { client, siteUrl, timezone, selectCompany } from "./erpnext-server"
import { ERPNextError } from "./erpnext-client"
import { businessDate, type Company } from "./model"
import { platformConfig } from "./platform/config"
import { mappedDashboard } from "./platform/erp-adapters"
import { permissionedReader } from "./erp-native/permissioned-reader"
import { accessibleDashboards } from "./erp-native/dashboard-access"
import { ALL_COMPANIES, isAllCompanies } from "./company-scope"
import {
  inventoryDashboard,
  inventoryDashboardIds,
} from "./erp-native/inventory-dashboard"
import {
  isNativeDashboard,
  nativeDashboard,
  nativeDashboardIds,
} from "./erp-native/dashboards"
import {
  operationalDashboard,
  operationalDashboardIds,
} from "./erp-native/operations-dashboards"

export type DashboardContext = {
  user: string
  company: string
  currency: string
  companies: Company[]
  siteUrl: string
  roles?: string[]
  dashboardIds?: DashboardId[]
}
export async function loadContext(
  selectedCompany?: string,
  includeDashboardAccess = false,
  includeRoles = false
): Promise<DashboardContext> {
  const erp = await client()
  const user = await erp.user()
  const companies = await erp.list<Company>("Company", {
    fields: ["name", "default_currency"],
  })
  const company = selectCompany(companies, selectedCompany)
  const config = platformConfig()
  // Assistant assignments must not change access to ordinary ERP dashboards.
  // Explicit dashboard role mappings still apply when supplied.
  const mapped = Object.keys(config.dashboards).length > 0
  const roles =
    mapped || includeDashboardAccess || includeRoles
      ? await erp.roles()
      : undefined
  const context: DashboardContext = {
    user,
    company: company.name,
    currency: isAllCompanies(company.name)
      ? company.default_currency
      : company.default_currency || "SAR",
    companies,
    siteUrl: siteUrl(),
    ...(roles
      ? {
          roles,
          ...(mapped
            ? {
                dashboardIds: Object.entries(config.dashboards)
                  .filter(([, mapping]) =>
                    mapping.roles.some((role) => roles.includes(role))
                  )
                  .map(([id]) => id as DashboardId),
              }
            : {}),
        }
      : {}),
  }
  if (includeDashboardAccess) {
    const reports = Object.fromEntries(
      Object.entries(config.dashboards).flatMap(([id, mapping]) => {
        const report = config.reports?.find(
          (r) => r.id === mapping.report && r.readValidated
        )
        return mapping.mappingValidated && report ? [[id, report.erpName]] : []
      })
    )
    context.dashboardIds = await accessibleDashboards(
      erp,
      {
        ...context,
        company: isAllCompanies(context.company)
          ? companies[0].name
          : context.company,
        roles: roles!,
      },
      timezone,
      reports
    )
  }
  return context
}

type Adapter = (
  context: DashboardContext,
  period: DashboardData["period"]
) => Promise<DashboardData>
// Register adapters only after the company provides data sources and definitions.
// Supports ERPNext, Metabase, or another service through the same UI contract.
export const dashboardAdapters: Partial<Record<DashboardId, Adapter>> = {}
for (const id of nativeDashboardIds) {
  dashboardAdapters[id] = async (context, period) =>
    nativeDashboard(
      permissionedReader(await client(), context),
      id,
      context,
      period
    )
}
for (const id of operationalDashboardIds) {
  dashboardAdapters[id] = async (context, period) => {
    const erp = await client()
    return operationalDashboard(
      erp,
      id,
      { ...context, roles: context.roles ?? (await erp.roles()) },
      period
    )
  }
}
for (const id of inventoryDashboardIds) {
  dashboardAdapters[id] = async (context, period) =>
    inventoryDashboard(await client(), id, context, period)
}
for (const [id, mapping] of Object.entries(platformConfig().dashboards)) {
  const definition = findDashboard(id)
  if (definition && mapping.mappingValidated && !isNativeDashboard(id))
    dashboardAdapters[definition.id] = (context, period) =>
      mappedDashboard(id, context, period)
}

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
  if (context.dashboardIds && !context.dashboardIds.includes(definition.id))
    throw new ERPNextError("Dashboard access denied.", 403)
  if (isAllCompanies(context.company)) {
    const companyResults: NonNullable<DashboardData["companyResults"]> = []
    for (const company of context.companies) {
      try {
        const data = await adapter(
          {
            ...context,
            company: company.name,
            currency: company.default_currency || "SAR",
          },
          pending.period
        )
        if (data.company !== company.name || data.dashboardId !== definition.id)
          throw new ERPNextError(
            "Dashboard returned data for a different company or view.",
            502
          )
        companyResults.push({ company: company.name, data })
        if (definition.scope === "erp-account") break
      } catch (error) {
        if (error instanceof ERPNextError && error.status === 401) throw error
        companyResults.push({
          company: company.name,
          error:
            error instanceof ERPNextError
              ? error.message
              : "Dashboard could not be loaded.",
        })
      }
    }
    return {
      ...pending,
      company: ALL_COMPANIES,
      status: "ready" as const,
      metrics: [],
      companyResults,
    }
  }
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
