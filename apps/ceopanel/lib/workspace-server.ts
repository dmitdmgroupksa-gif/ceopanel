import "server-only"
import { loadContext, type DashboardContext } from "./dashboard-server"
import { ERPNextError } from "./erpnext-client"
import {
  pendingSchema,
  requiredValues,
  standardModules,
  validateValues,
  type ModuleSchema,
  type RecordValues,
  type ReportData,
  type ReportDefinition,
  type WorkspaceModule,
  type WorkspaceRecord,
} from "./workspace"

export type WorkspaceAdapter = {
  schema: (context: DashboardContext) => Promise<ModuleSchema>
  list: (
    context: DashboardContext,
    query: { search: string; offset: number; limit: number }
  ) => Promise<{ records: WorkspaceRecord[]; hasMore: boolean }>
  get: (context: DashboardContext, name: string) => Promise<WorkspaceRecord>
  create?: (
    context: DashboardContext,
    values: RecordValues
  ) => Promise<WorkspaceRecord>
  update?: (
    context: DashboardContext,
    name: string,
    values: RecordValues,
    expectedModified: string
  ) => Promise<WorkspaceRecord>
  action?: (
    context: DashboardContext,
    name: string,
    action: "submit" | "cancel",
    expectedModified: string
  ) => Promise<WorkspaceRecord>
}
// Register these after the company supplies its API, custom fields, and workflows.
// Each adapter must use the authenticated user's ERPNext permissions and check
// field-level read access. Never fall back to a shared administrator token.
export const customModules: WorkspaceModule[] = []
export const workspaceAdapters: Record<string, WorkspaceAdapter> = {}
export const customReports: ReportDefinition[] = []
export const reportAdapters: Record<
  string,
  (context: DashboardContext, filters: RecordValues) => Promise<ReportData>
> = {}
export function workspaceCatalog() {
  return [...standardModules, ...customModules]
}

function moduleFor(id: string) {
  const module = workspaceCatalog().find((item) => item.id === id)
  if (!module) throw new ERPNextError("Workspace module not found.", 404)
  return module
}
function ensureCompany(
  record: WorkspaceRecord,
  schema: ModuleSchema,
  company: string
) {
  if (schema.companyField && record.values[schema.companyField] !== company)
    throw new ERPNextError(
      "This record does not belong to the selected company.",
      403
    )
}
async function authorized(id: string, company?: string) {
  const module = moduleFor(id)
  const adapter = Object.hasOwn(workspaceAdapters, id)
    ? workspaceAdapters[id]
    : undefined
  if (!adapter)
    throw new ERPNextError("This module is awaiting API setup.", 409)
  const context = await loadContext(company)
  const schema = await adapter.schema(context)
  if (
    !schema.ready ||
    schema.module.id !== module.id ||
    schema.module.doctype !== module.doctype
  )
    throw new ERPNextError("This module's API setup is incomplete.", 409)
  return { adapter, context, schema }
}
export async function workspaceSchema(id: string, company?: string) {
  const module = moduleFor(id)
  if (!Object.hasOwn(workspaceAdapters, id)) return pendingSchema(module)
  const { schema } = await authorized(id, company)
  return schema
}
export async function workspaceList(
  id: string,
  company: string | undefined,
  query: { search: string; offset: number; limit: number }
) {
  if (
    !Number.isInteger(query.offset) ||
    query.offset < 0 ||
    !Number.isInteger(query.limit) ||
    query.limit < 1 ||
    query.limit > 100 ||
    query.search.length > 200
  )
    throw new ERPNextError("Invalid record query.", 400)
  const { adapter, context, schema } = await authorized(id, company)
  if (!schema.permissions.read)
    throw new ERPNextError("Your account cannot read these records.", 403)
  const result = await adapter.list(context, query)
  result.records.forEach((record) =>
    ensureCompany(record, schema, context.company)
  )
  return result
}
export async function workspaceGet(id: string, name: string, company?: string) {
  const { adapter, context, schema } = await authorized(id, company)
  if (!schema.permissions.read)
    throw new ERPNextError("Your account cannot read this record.", 403)
  const record = await adapter.get(context, name)
  ensureCompany(record, schema, context.company)
  return record
}
export async function workspaceSave(
  id: string,
  company: string | undefined,
  input: { name?: string; values: unknown; modified?: string }
) {
  const { adapter, context, schema } = await authorized(id, company)
  const permission = input.name ? "edit" : "create"
  if (
    !schema.permissions.read ||
    !schema.permissions[permission] ||
    (input.name ? !adapter.update : !adapter.create)
  )
    throw new ERPNextError("Your account cannot save this record.", 403)
  let submitted = false
  if (input.name) {
    const existing = await adapter.get(context, input.name)
    ensureCompany(existing, schema, context.company)
    if (!input.modified || existing.modified !== input.modified)
      throw new ERPNextError(
        "This record changed in ERPNext. Reload it before saving.",
        409
      )
    if (existing.docstatus === 2)
      throw new ERPNextError("Cancelled records cannot be edited.", 409)
    submitted = existing.docstatus === 1
  }
  let values: RecordValues
  try {
    values = validateValues(input.values, schema.fields, submitted)
    if (schema.companyField) values[schema.companyField] = context.company
    if (!input.name) requiredValues(values, schema.fields)
  } catch (cause) {
    throw new ERPNextError(
      cause instanceof Error ? cause.message : "Invalid record values.",
      400
    )
  }
  const result = input.name
    ? await adapter.update!(context, input.name, values, input.modified!)
    : await adapter.create!(context, values)
  ensureCompany(result, schema, context.company)
  return result
}
export async function workspaceAction(
  id: string,
  name: string,
  company: string | undefined,
  action: string,
  modified: string
) {
  if (action !== "submit" && action !== "cancel")
    throw new ERPNextError("Unsupported document action.", 400)
  const { adapter, context, schema } = await authorized(id, company)
  if (
    !schema.permissions.read ||
    !schema.submittable ||
    !schema.permissions[action] ||
    !adapter.action
  )
    throw new ERPNextError(
      "Your account cannot perform this document action.",
      403
    )
  const existing = await adapter.get(context, name)
  ensureCompany(existing, schema, context.company)
  if (!modified || existing.modified !== modified)
    throw new ERPNextError(
      "This record changed in ERPNext. Reload it before continuing.",
      409
    )
  if (
    (action === "submit" && (existing.docstatus ?? 0) !== 0) ||
    (action === "cancel" && existing.docstatus !== 1)
  )
    throw new ERPNextError(
      "This action is unavailable in the record's current state.",
      409
    )
  const result = await adapter.action(context, name, action, modified)
  ensureCompany(result, schema, context.company)
  return result
}
export async function workspaceReport(
  id: string,
  company: string | undefined,
  filters: unknown
) {
  const report = customReports.find((item) => item.id === id)
  const adapter = Object.hasOwn(reportAdapters, id)
    ? reportAdapters[id]
    : undefined
  if (!report || !adapter)
    throw new ERPNextError("This custom report is awaiting API setup.", 409)
  const context = await loadContext(company)
  let values: RecordValues
  try {
    values = validateValues(filters, report.filters)
    if (report.companyField) values[report.companyField] = context.company
    requiredValues(values, report.filters)
  } catch (cause) {
    throw new ERPNextError(
      cause instanceof Error ? cause.message : "Invalid report filters.",
      400
    )
  }
  return adapter(context, values)
}
