import type { DashboardContext } from "../dashboard-server"
import { dashboards, type DashboardId } from "../dashboards"
import { ERPNextError, type ERPNextClient } from "../erpnext-client"
import { businessDate, makePeriod } from "../model"
import { nativeDashboard, nativeDashboardIds } from "./dashboards"
import { operationalDashboard, operationalDashboardIds } from "./operations-dashboards"
import { inventoryDashboard, inventoryDashboardIds, stockBalanceFields } from "./inventory-dashboard"
import { permissionedReader } from "./permissioned-reader"
import { erpReader } from "./reader"

// Request-local metadata checks: no business rows, totals, service credentials or
// cross-user permission caches. Native adapters themselves define required fields.
export async function accessibleDashboards(
  erp: ERPNextClient,
  context: DashboardContext & { roles: string[] },
  timezone: string,
  mappedReports: Partial<Record<DashboardId, string>> = {},
): Promise<DashboardId[]> {
  const requests = new Map<string, Promise<any>>()
  const permissions = new Map<string, Promise<boolean>>()
  const metadata = {
    roles: async () => context.roles,
    canRead(doctype: string) {
      if (!permissions.has(doctype)) permissions.set(doctype, erp.canRead(doctype))
      return permissions.get(doctype)!
    },
    request(path: string) {
      if (!requests.has(path)) requests.set(path, erp.request(path))
      return requests.get(path)!
    },
    list: async <T>(doctype: string, query: Parameters<ERPNextClient["list"]>[1]): Promise<T[]> =>
      // Workflow/Report are definitions. Do not load business records to build navigation.
      doctype === "Workflow" || doctype === "Report" ? erp.list<T>(doctype, query) : [],
    page: async <T>(doctype: string, query: Parameters<ERPNextClient["page"]>[1]): Promise<T[]> =>
      doctype === "Report" ? erp.page<T>(doctype, query) : [],
  }
  const reader = permissionedReader(metadata, context)
  const period = makePeriod(1, businessDate(new Date(), timezone))
  const result = new Set<DashboardId>()
  const candidates = dashboards.filter((d) => !context.dashboardIds || context.dashboardIds.includes(d.id))
  let cursor = 0
  await Promise.all(Array.from({ length: 3 }, async () => {
    for (;;) {
      const definition = candidates[cursor++]
      if (!definition) return
      const id = definition.id
      try {
        if (nativeDashboardIds.some((v) => v === id)) {
          await nativeDashboard(reader, id, context, period)
        } else if (inventoryDashboardIds.some((v) => v === id)) {
          await inventoryDashboard(metadata, id, context, period)
          // No warehouses are loaded during navigation discovery, so explicitly
          // check the balance fields that the actual warehouse loop will require.
          await reader.list("Bin", { fields: stockBalanceFields })
        } else if (id === "approvals") {
          const workflows = await metadata.list<{ document_type: string; workflow_state_field: string }>("Workflow", {
            fields: ["name", "document_type", "workflow_state_field"], filters: [["is_active", "=", 1]],
          })
          let readable = false
          for (const workflow of workflows) {
            try {
              const schema = await reader.describe(workflow.document_type)
              if (schema.fields.some((f) => f.fieldname === workflow.workflow_state_field)) { readable = true; break }
            } catch (error) {
              if (error instanceof ERPNextError && error.status === 401) throw error
            }
          }
          if (!readable) continue
        } else if (operationalDashboardIds.some((v) => v === id)) {
          await operationalDashboard(metadata, id, context, period)
        } else if (mappedReports[id]) {
          await erpReader(metadata, context).report(mappedReports[id]!)
        } else continue
        result.add(id)
      } catch (error) {
        if (error instanceof ERPNextError && error.status === 401) throw error
        // A permission denial, missing source or schema problem cannot grant visibility.
      }
    }
  }))
  return dashboards.filter((d) => result.has(d.id)).map((d) => d.id)
}
