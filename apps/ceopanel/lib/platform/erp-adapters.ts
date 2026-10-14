import "server-only"
import { client } from "../erpnext-server"
import { ERPNextError } from "../erpnext-client"
import { platformConfig } from "./config"
import {
  standardModules,
  type ModuleSchema,
  type WorkspaceRecord,
  type WorkspaceModule,
  type ReportData,
  type ReportDefinition,
  type RecordValues,
} from "../workspace"
import type { WorkspaceAdapter } from "../workspace-server"
import type { DashboardContext } from "../dashboard-server"
import { findDashboard, type DashboardData } from "../dashboards"
import { dashboardFromReport } from "./report-mapping"
export function configuredWorkspace() {
  const config = platformConfig()
  const modules: WorkspaceModule[] = config.modules
    .filter((m) => m.custom)
    .map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      doctype: m.doctype,
      custom: true,
    }))
  const adapters: Record<string, WorkspaceAdapter> = {}
  for (const mapping of config.modules.filter((m) => m.readValidated)) {
    const module = [...standardModules, ...modules].find(
      (m) => m.id === mapping.id,
    )
    if (!module || module.doctype !== mapping.doctype)
      throw new Error("ERP module configuration does not match its catalog")
    async function invoke<T>(
      context: DashboardContext,
      operation: string,
      args: object = {},
    ) {
      return (await client()).bridge<T>(operation, {
        module: mapping.id,
        company: context.company,
        ...args,
      })
    }
    adapters[mapping.id] = {
      schema: (c) => invoke<ModuleSchema>(c, "schema"),
      list: (c, query) =>
        invoke<{ records: WorkspaceRecord[]; hasMore: boolean }>(
          c,
          "records",
          query,
        ),
      get: (c, name) => invoke<WorkspaceRecord>(c, "record", { name }),
      ...(mapping.writeValidated
        ? {
            create: (c: DashboardContext, values: RecordValues) =>
              invoke<WorkspaceRecord>(c, "save", { values }),
            update: (
              c: DashboardContext,
              name: string,
              values: RecordValues,
              expectedModified: string,
            ) =>
              invoke<WorkspaceRecord>(c, "save", {
                name,
                values,
                expectedModified,
              }),
            action: (
              c: DashboardContext,
              name: string,
              action: string,
              expectedModified: string,
            ) =>
              invoke<WorkspaceRecord>(c, "action", {
                name,
                action,
                expectedModified,
              }),
          }
        : {}),
    }
  }
  const reports: ReportDefinition[] = config.reports.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    filters: r.filters,
    companyField: r.companyField,
  }))
  const reportAdapters: Record<
    string,
    (c: DashboardContext, f: RecordValues) => Promise<ReportData>
  > = {}
  for (const r of config.reports.filter((r) => r.readValidated))
    reportAdapters[r.id] = async (c, filters) =>
      (await client()).bridge("report", {
        report: r.id,
        company: c.company,
        filters,
      })
  return { modules, adapters, reports, reportAdapters }
}
export async function mappedDashboard(
  id: string,
  context: DashboardContext,
  period: DashboardData["period"],
): Promise<DashboardData> {
  const definition = findDashboard(id)
  const mapping = platformConfig().dashboards[id]
  if (!definition || !mapping?.mappingValidated)
    throw new ERPNextError("Dashboard mapping is awaiting validation.", 409)
  const erp = await client()
  const roles = await erp.bridge<string[]>("roles")
  if (!mapping.roles.some((r) => roles.includes(r)))
    throw new ERPNextError("Dashboard access denied.", 403)
  const report = platformConfig().reports.find(
    (r) => r.id === mapping.report && r.readValidated,
  )
  if (!report)
    throw new ERPNextError("Dashboard report awaits validation.", 409)
  const data = await erp.bridge<ReportData>("report", {
    report: report.id,
    company: context.company,
    filters: {
      [mapping.periodFilters.from]: period.from,
      [mapping.periodFilters.to]: period.to,
    },
  })
  return dashboardFromReport(definition, context, period, mapping, data)
}
