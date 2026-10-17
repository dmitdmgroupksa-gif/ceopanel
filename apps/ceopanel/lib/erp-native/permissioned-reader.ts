import { ERPNextError, type ERPNextClient } from "../erpnext-client"
import type { DashboardContext } from "../dashboard-server"
import { erpReader, scalar } from "./reader"
import type { ERPDocument } from "../model"

export type NativeReadClient = Pick<
  ERPNextClient,
  "roles" | "request" | "canRead" | "page" | "list"
>
type Query = Parameters<ERPNextClient["list"]>[1]
const systemFields = [
  "name",
  "modified",
  "creation",
  "owner",
  "modified_by",
  "docstatus",
]

// Frappe v14's API field-permission setting is optional. Every native portal
// adapter must apply effective metadata permissions regardless of that setting.
// This cache lives for one operation only, never across users or requests.
export function permissionedReader(
  erp: NativeReadClient,
  context: DashboardContext,
) {
  let reader: Promise<ReturnType<typeof erpReader>> | undefined
  const schemas = new Map<
    string,
    ReturnType<ReturnType<typeof erpReader>["describe"]>
  >()
  function describe(doctype: string) {
    if (!reader)
      reader = (async () =>
        erpReader(erp, {
          ...context,
          roles: context.roles ?? (await erp.roles()),
        }))()
    if (!schemas.has(doctype))
      schemas.set(
        doctype,
        reader.then((r) => r.describe(doctype)),
      )
    return schemas.get(doctype)!
  }
  async function validate(doctype: string, query: Query) {
    const schema = await describe(doctype)
    const allowed = new Set([
      ...systemFields,
      ...schema.fields
        .filter((f) => !f.fieldtype.startsWith("Table"))
        .map((f) => f.fieldname),
    ])
    const requested = [
      ...query.fields,
      ...(query.filters || []).map((f) => f[0]),
      ...(query.orFilters || []).map((f) => f[0]),
    ]
    if (requested.some((field) => !allowed.has(field)))
      throw new ERPNextError(
        "A required ERP field is missing or restricted. This view cannot be loaded.",
        403,
      )
  }
  function project<T>(rows: T[], fields: string[]): T[] {
    return rows.map((value) => {
      const row = value as Record<string, unknown>
      if (
        !row ||
        typeof row !== "object" ||
        fields.some(
          (field) => !Object.hasOwn(row, field) || !scalar(row[field]),
        )
      )
        throw new ERPNextError(
          "A required ERP field is missing or restricted. This view cannot be loaded.",
          403,
        )
      return Object.fromEntries(fields.map((field) => [field, row[field]])) as T
    })
  }
  return {
    describe,
    list: async <T = ERPDocument>(
      doctype: string,
      query: Query,
    ): Promise<T[]> => {
      await validate(doctype, query)
      return project(await erp.list<T>(doctype, query), query.fields)
    },
    page: async <T = ERPDocument>(
      doctype: string,
      query: Parameters<ERPNextClient["page"]>[1],
    ): Promise<T[]> => {
      await validate(doctype, query)
      return project(await erp.page<T>(doctype, query), query.fields)
    },
  }
}
