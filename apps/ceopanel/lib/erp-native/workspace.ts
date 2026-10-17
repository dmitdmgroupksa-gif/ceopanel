import "server-only"
import { ERPNextError, type Filter } from "../erpnext-client"
import { client } from "../erpnext-server"
import { isAllCompanies, scopedCompanies } from "../company-scope"
import type { DashboardContext } from "../dashboard-server"
import type { WorkspaceAdapter } from "../workspace-server"
import type {
  Field,
  ModuleSchema,
  RecordValues,
  WorkspaceRecord,
} from "../workspace"
import { nativeModules, type NativeModule } from "./catalog"
import {
  permissionedReader,
  type NativeReadClient,
} from "./permissioned-reader"

function projection(
  mapping: NativeModule,
  row: Record<string, unknown>,
  fields: Field[]
): WorkspaceRecord {
  if (typeof row.name !== "string" || typeof row.modified !== "string")
    throw new ERPNextError("ERPNext returned an invalid record.")
  const names = [
    ...fields.map((field) => field.name),
    ...(mapping.scope === "company" ? ["company"] : []),
  ]
  const values: RecordValues = {}
  for (const name of names) {
    const value = row[name]
    if (
      value !== undefined &&
      value !== null &&
      typeof value !== "string" &&
      typeof value !== "boolean" &&
      !(typeof value === "number" && Number.isFinite(value))
    )
      throw new ERPNextError("ERPNext returned an invalid field value.")
    values[name] = value === undefined ? null : (value as RecordValues[string])
  }
  return {
    name: row.name,
    modified: row.modified,
    ...(typeof row.docstatus === "number" ? { docstatus: row.docstatus } : {}),
    values,
    workflowActions: [],
  }
}

export function nativeWorkspace(
  reader: () => Promise<NativeReadClient> = client
): Record<string, WorkspaceAdapter> {
  return Object.fromEntries(
    nativeModules.map((mapping) => {
      async function view(context: DashboardContext) {
        const erp = permissionedReader(await reader(), context)
        const metadata = await erp.describe(mapping.module.doctype)
        const allowed = new Set(
          metadata.fields
            .filter((f) => !f.fieldtype.startsWith("Table"))
            .map((f) => f.fieldname)
        )
        if (mapping.scope === "company" && !allowed.has("company"))
          throw new ERPNextError(
            "The Company field is missing or restricted.",
            403
          )
        return {
          erp,
          fields: mapping.fields.filter((f) => allowed.has(f.name)),
        }
      }
      const filters = (context: DashboardContext): Filter[] =>
        mapping.scope === "company"
          ? [
              [
                "company",
                isAllCompanies(context.company) ? "in" : "=",
                isAllCompanies(context.company)
                  ? scopedCompanies(context)
                  : context.company,
              ],
            ]
          : []
      async function page(
        context: DashboardContext,
        query: {
          search?: string
          offset: number
          limit: number
          name?: string
        }
      ) {
        const { erp, fields: visibleFields } = await view(context)
        const fields = [
          ...new Set([
            "name",
            "modified",
            "docstatus",
            ...visibleFields.map((f) => f.name),
            ...(mapping.scope === "company" ? ["company"] : []),
          ]),
        ]
        const search = query.search?.trim().replace(/[\\%_]/g, "\\$&")
        const rows = await erp.page(mapping.module.doctype, {
          fields,
          filters: [
            ...filters(context),
            ...(query.name ? [["name", "=", query.name] as Filter] : []),
          ],
          ...(search
            ? {
                orFilters: mapping.searchFields
                  .filter((name) => fields.includes(name))
                  .map((name): Filter => [name, "like", `%${search}%`]),
              }
            : {}),
          offset: query.offset,
          limit: query.limit,
          orderBy: "modified desc, name asc",
        })
        const projected = rows.map((row) =>
          projection(mapping, row, visibleFields)
        )
        if (
          new Set(projected.map((row) => row.name)).size !== projected.length ||
          projected.some((row) => query.name && row.name !== query.name)
        )
          throw new ERPNextError(
            "ERPNext returned duplicate or mismatched record identities.",
            409
          )
        if (
          mapping.scope === "company" &&
          projected.some(
            (row) =>
              !scopedCompanies(context).includes(String(row.values.company))
          )
        )
          throw new ERPNextError(
            "ERPNext returned records for a different company.",
            403
          )
        return projected
      }
      const adapter: WorkspaceAdapter = {
        schema: async (context): Promise<ModuleSchema> => {
          let fields: Field[] = [],
            readable = false
          try {
            fields = (await view(context)).fields
            readable = true
          } catch (error) {
            if (!(error instanceof ERPNextError) || error.status !== 403)
              throw error
          }
          return {
            module: mapping.module,
            ready: true,
            scope: mapping.scope,
            fields,
            columns: [
              { key: "name", label: "Record" },
              ...(isAllCompanies(context.company) && mapping.scope === "company"
                ? [{ key: "company", label: "Company" }]
                : []),
              ...fields
                .filter(
                  (field) =>
                    !(
                      isAllCompanies(context.company) &&
                      mapping.scope === "company" &&
                      field.name === "company"
                    )
                )
                .slice(0, 6)
                .map((field) => ({ key: field.name, label: field.label })),
            ],
            permissions: {
              read: readable,
              create: false,
              edit: false,
              submit: false,
              cancel: false,
            },
            ...(mapping.scope === "company" ? { companyField: "company" } : {}),
            submittable: false,
            workflowActions: [],
          }
        },
        list: async (context, query) => {
          const rows = await page(context, { ...query, limit: query.limit + 1 })
          return {
            records: rows.slice(0, query.limit),
            hasMore: rows.length > query.limit,
          }
        },
        get: async (context, name) => {
          if (!name || name.length > 255)
            throw new ERPNextError("Invalid record name.", 400)
          const rows = await page(context, { name, offset: 0, limit: 1 })
          if (!rows[0])
            throw new ERPNextError(
              "Record not found or unavailable to your account.",
              404
            )
          return rows[0]
        },
      }
      return [mapping.module.id, adapter]
    })
  )
}
