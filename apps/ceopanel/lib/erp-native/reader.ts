import { parse } from "acorn"
import {
  ERPNextError,
  type ERPNextClient,
  type Filter,
} from "../erpnext-client"
import type { UserContext } from "../platform/policy"
import { safeBusinessType, secretField } from "./read-policy"

type Row = Record<string, any>
type Reader = Pick<ERPNextClient, "request" | "page" | "list" | "canRead">
export type MetaField = {
  fieldname: string
  label?: string
  fieldtype: string
  options?: string
  permlevel?: number
  reqd?: number
  hidden?: number
}
type Meta = {
  name: string
  module?: string
  issingle?: number
  istable?: number
  fields: MetaField[]
  permissions?: Row[]
}
const layout = new Set([
  "Section Break",
  "Column Break",
  "Tab Break",
  "HTML",
  "Button",
  "Heading",
  "Fold",
  "Image",
])
const systemFields = [
  "name",
  "owner",
  "creation",
  "modified",
  "modified_by",
  "docstatus",
]
export const scalar = (v: unknown): v is string | number | boolean | null =>
  v === null ||
  typeof v === "string" ||
  typeof v === "boolean" ||
  (typeof v === "number" && Number.isFinite(v))
export function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 180 ||
    /[\x00-\x1f]/.test(value)
  )
    throw new ERPNextError("Invalid ERP source or record name.", 400)
  return value
}
const rpcPath = (method: string, params: Record<string, string>) =>
  `/api/method/${method}?${new URLSearchParams(params)}`
const fieldName = /^[\p{L}_][\p{L}\p{M}\p{N}_]*$/u

export function reportFilters(
  input: unknown,
  definitions: { fieldname: string; required: boolean }[],
  builder = false,
) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).length > 40 ||
    JSON.stringify(input).length > 16000
  )
    throw new ERPNextError("Invalid report filters.", 400)
  const filters: Row = Object.create(null)
  for (const [key, value] of Object.entries(input)) {
    if (
      !fieldName.test(key) ||
      secretField(key) ||
      !(
        scalar(value) ||
        (Array.isArray(value) && value.length <= 100 && value.every(scalar)) ||
        (builder &&
          Array.isArray(value) &&
          value.length === 2 &&
          typeof value[0] === "string" &&
          Array.isArray(value[1]) &&
          value[1].length <= 100 &&
          value[1].every(scalar))
      )
    )
      throw new ERPNextError("Invalid report filter value.", 400)
    if (builder && !definitions.some((f) => f.fieldname === key))
      throw new ERPNextError(
        "Unknown Report Builder filter field. Describe the report first.",
        400,
      )
    filters[key] = value
  }
  for (const f of definitions)
    if (
      f.required &&
      (filters[f.fieldname] === undefined ||
        filters[f.fieldname] === "" ||
        filters[f.fieldname] === null ||
        (Array.isArray(filters[f.fieldname]) && !filters[f.fieldname].length))
    )
      throw new ERPNextError(`Report requires filter: ${f.fieldname}.`, 400)
  return filters
}

// Inspect literal filter definitions only. Never eval report Javascript, defaults,
// conditions, queries or SQL in the application or model process.
export function reportScriptFilters(script: string): MetaField[] {
  if (script.length > 500000) return []
  try {
    const tree = parse(script, { ecmaVersion: "latest", sourceType: "script" })
    const found: MetaField[] = []
    function walk(node: any, depth = 0) {
      if (!node || typeof node !== "object" || depth > 100) return
      if (
        node.type === "Property" &&
        (node.key?.name || node.key?.value) === "filters" &&
        node.value?.type === "ArrayExpression"
      ) {
        for (const element of node.value.elements) {
          if (element?.type !== "ObjectExpression") continue
          const values: Row = {}
          for (const p of element.properties) {
            const key = p.key?.name || p.key?.value
            if (
              !["fieldname", "label", "fieldtype", "options", "reqd"].includes(
                key,
              )
            )
              continue
            if (p.value?.type === "Literal") values[key] = p.value.value
            else if (
              key === "label" &&
              p.value?.type === "CallExpression" &&
              p.value.callee?.name === "__" &&
              p.value.arguments[0]?.type === "Literal"
            )
              values[key] = p.value.arguments[0].value
          }
          if (
            typeof values.fieldname === "string" &&
            typeof values.fieldtype === "string" &&
            !secretField(values.fieldname, values.fieldtype)
          )
            found.push(values as MetaField)
        }
      }
      for (const [key, child] of Object.entries(node)) {
        if (["start", "end"].includes(key)) continue
        if (Array.isArray(child)) child.forEach((c) => walk(c, depth + 1))
        else if (child && typeof child === "object") walk(child, depth + 1)
      }
    }
    walk(tree)
    return [...new Map(found.map((f) => [f.fieldname, f])).values()]
  } catch {
    return []
  }
}

export function erpReader(erp: Reader, context: UserContext) {
  // Request-local only. Metadata, roles and permission decisions never share a
  // cache between ERP identities or survive a later tool/resource request.
  const metas = new Map<string, Promise<Meta[]>>()
  async function rpc(method: string, params: Record<string, string>) {
    const body = await erp.request(rpcPath(method, params))
    if (body.message === undefined)
      throw new ERPNextError("ERP returned an invalid response.")
    return body.message
  }
  async function get(doctype: string, name: string): Promise<Row> {
    const doc = await rpc("frappe.client.get", {
      doctype: identifier(doctype),
      name: identifier(name),
    })
    if (
      !doc ||
      typeof doc !== "object" ||
      Array.isArray(doc) ||
      doc.name !== name ||
      doc.doctype !== doctype
    )
      throw new ERPNextError("ERP returned an invalid document.")
    return doc
  }
  async function bundle(doctype: string) {
    identifier(doctype)
    if (!metas.has(doctype))
      metas.set(
        doctype,
        (async () => {
          if (!(await erp.canRead(doctype)))
            throw new ERPNextError(
              "ERP read permission denied for this DocType.",
              403,
            )
          const body = await erp.request(
            rpcPath("frappe.desk.form.load.getdoctype", { doctype }),
          )
          if (
            !Array.isArray(body.docs) ||
            body.docs[0]?.name !== doctype ||
            !Array.isArray(body.docs[0]?.fields)
          )
            throw new ERPNextError("ERP returned an invalid DocType schema.")
          const meta = body.docs[0] as Meta
          if (!safeBusinessType(meta))
            throw new ERPNextError(
              "This source contains settings or security infrastructure, rather than business records.",
              403,
            )
          return body.docs as Meta[]
        })(),
      )
    return metas.get(doctype)!
  }
  function readable(meta: Meta, owner?: string, parent?: Meta) {
    // API v14 optionally applies field-level permissions. Apply effective native
    // metadata here as well, including Custom DocPerm and owner-only grants.
    const levels = new Set([
      0,
      ...(
        (meta.istable && parent ? parent.permissions : meta.permissions) || []
      )
        .filter(
          (p) =>
            p.read &&
            context.roles.includes(p.role) &&
            (!p.if_owner || owner === context.user),
        )
        .map((p) => Number(p.permlevel || 0)),
    ])
    return meta.fields.filter(
      (f) =>
        f.fieldname &&
        levels.has(Number(f.permlevel || 0)) &&
        !secretField(f.fieldname, f.fieldtype) &&
        !secretField(f.label || "") &&
        !layout.has(f.fieldtype) &&
        f.fieldtype !== "Code",
    )
  }
  type BuilderField = {
    doctype: string
    fieldname: string
    label: string
    fieldtype: string
    options?: string
    expression: string
  }
  function builderSettings(value: unknown): Row {
    try {
      const parsed =
        typeof value === "string" ? JSON.parse(value || "{}") : value || {}
      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        JSON.stringify(parsed).length > 100000
      )
        throw new Error()
      return parsed
    } catch {
      throw new ERPNextError(
        "Saved Report Builder settings are invalid or too large.",
        409,
      )
    }
  }
  function builderFields(docs: Meta[], parent: string): BuilderField[] {
    const visibleTables = new Set(
      readable(docs[0])
        .filter((f) => f.fieldtype.startsWith("Table"))
        .map((f) => f.fieldname),
    )
    return docs.flatMap((meta) => {
      if (meta.name !== parent) {
        const connections = docs[0].fields.filter(
          (f) => f.fieldtype.startsWith("Table") && f.options === meta.name,
        )
        // Frappe v14 joins child rows by parent/parenttype, not parentfield.
        // A shared child DocType must not expose rows from a restricted table.
        if (
          !connections.length ||
          connections.some((f) => !visibleTables.has(f.fieldname))
        )
          return []
      }
      if (meta.name.includes("`"))
        throw new ERPNextError("Unsupported Report Builder source name.", 400)
      const fields = [
        ...systemFields.map((fieldname) => ({
          fieldname,
          fieldtype: fieldname === "docstatus" ? "Int" : "Data",
          label: fieldname,
        })),
        ...readable(meta, undefined, docs[0]).filter(
          (f) => !f.fieldtype.startsWith("Table"),
        ),
      ]
      if (meta.name !== parent)
        fields.push(
          ...["idx", "parent", "parenttype", "parentfield"].map(
            (fieldname) => ({ fieldname, fieldtype: "Data", label: fieldname }),
          ),
        )
      return [...new Map(fields.map((f) => [f.fieldname, f])).values()]
        .filter((f) => fieldName.test(f.fieldname))
        .map((f) => ({
          doctype: meta.name,
          fieldname: f.fieldname,
          label: f.label || f.fieldname,
          fieldtype: f.fieldtype,
          options: "options" in f ? f.options : undefined,
          expression: `\`tab${meta.name}\`.\`${f.fieldname}\``,
        }))
    })
  }
  function builderField(
    doctype: unknown,
    fieldname: unknown,
    fields: BuilderField[],
  ) {
    const field = fields.find(
      (f) => f.doctype === doctype && f.fieldname === fieldname,
    )
    if (!field)
      throw new ERPNextError(
        "Saved report references an unknown or restricted field.",
        403,
      )
    return field
  }
  function selectedBuilderFields(
    value: unknown,
    fields: BuilderField[],
    parent: string,
  ) {
    if (value !== undefined && (!Array.isArray(value) || value.length > 100))
      throw new ERPNextError("Invalid saved report columns.", 409)
    const selected = ((value as unknown[]) || [["name", parent]]).map((v) => {
      if (!Array.isArray(v) || v.length !== 2)
        throw new ERPNextError("Invalid saved report column.", 409)
      return builderField(v[1], v[0], fields)
    })
    return [
      ...new Map(
        [builderField(parent, "name", fields), ...selected].map((f) => [
          `${f.doctype}:${f.fieldname}`,
          f,
        ]),
      ).values(),
    ]
  }
  function safeBuilderFilters(
    value: unknown,
    fields: BuilderField[],
    parent: string,
  ): unknown[][] {
    const ops = new Set([
      "=",
      "!=",
      ">",
      ">=",
      "<",
      "<=",
      "like",
      "not like",
      "in",
      "not in",
      "between",
      "is",
      "timespan",
    ])
    if (typeof value === "string") {
      try {
        value = JSON.parse(value)
      } catch {
        throw new ERPNextError("Invalid saved report filters.", 409)
      }
    }
    if (value !== undefined && value !== null && typeof value !== "object")
      throw new ERPNextError("Invalid saved report filters.", 409)
    const input = Array.isArray(value)
      ? value
      : value && typeof value === "object"
        ? Object.entries(value).map(([field, v]) =>
            Array.isArray(v) && ops.has(v[0])
              ? [field, v[0], v[1]]
              : [field, Array.isArray(v) ? "in" : "=", v],
          )
        : []
    if (input.length > 100)
      throw new ERPNextError("Too many saved report filters.", 400)
    return input.map((tuple) => {
      if (!Array.isArray(tuple) || ![3, 4, 5].includes(tuple.length))
        throw new ERPNextError("Invalid saved report filter.", 409)
      const [dt, field, operator, v] =
        tuple.length === 3 ? [parent, ...tuple] : tuple
      builderField(dt, field, fields)
      if (
        typeof operator !== "string" ||
        !ops.has(operator.toLowerCase()) ||
        !(scalar(v) || (Array.isArray(v) && v.length <= 100 && v.every(scalar)))
      )
        throw new ERPNextError("Unsupported Report Builder filter.", 400)
      const op = operator.toLowerCase()
      if (["in", "not in", "between"].includes(op) && !Array.isArray(v))
        throw new ERPNextError("This report filter requires a list value.", 400)
      if (op === "between" && Array.isArray(v) && v.length !== 2)
        throw new ERPNextError("Between filters require two values.", 400)
      return [dt, field, op, v]
    })
  }
  function qualifiedBuilderField(
    value: unknown,
    fields: BuilderField[],
    parent: string,
  ) {
    if (typeof value !== "string")
      throw new ERPNextError("Invalid saved grouping field.", 409)
    const match = value.match(/^`tab([^`]+)`\.`([a-zA-Z_][a-zA-Z0-9_]*)`$/)
    return builderField(match?.[1] || parent, match?.[2] || value, fields)
  }
  function checkedGroup(value: Row, fields: BuilderField[], parent: string) {
    const field = qualifiedBuilderField(value.group_by, fields, parent),
      fn = String(value.aggregate_function || "count").toLowerCase(),
      aggregate = qualifiedBuilderField(
        value.aggregate_on || "name",
        fields,
        parent,
      )
    if (
      !["count", "sum", "avg"].includes(fn) ||
      (fn !== "count" &&
        !["Int", "Float", "Currency", "Percent", "Duration"].includes(
          aggregate.fieldtype,
        ))
    )
      throw new ERPNextError(
        "Unsupported saved aggregate function or field.",
        409,
      )
    return { field, fn, aggregate }
  }
  async function runBuilder(
    description: { name: string; doctype: string; scope?: string },
    filters: Row,
  ) {
    const parent = description.doctype,
      docs = await bundle(parent),
      fields = builderFields(docs, parent),
      saved = builderSettings((await get("Report", description.name)).json)
    let selected = selectedBuilderFields(saved.fields, fields, parent)
    const group = saved.group_by
      ? checkedGroup(saved.group_by, fields, parent)
      : null
    if (group) selected = [group.field]
    const conditions = [
      ...safeBuilderFilters(saved.filters || [], fields, parent),
      ...safeBuilderFilters(filters, fields, parent),
    ]
    const expressions = selected.map((f, i) => `${f.expression} as c${i}`)
    const params: Record<string, string> = {
      doctype: parent,
      fields: JSON.stringify(expressions),
      filters: JSON.stringify(conditions),
      page_length: "200",
      save_user_settings: "false",
      order_by: group
        ? group.field.expression + " asc"
        : [...new Set([parent, ...selected.map((f) => f.doctype)])]
            .map((dt) => `\`tab${dt}\`.\`name\` asc`)
            .join(", "),
    }
    if (group)
      Object.assign(params, {
        group_by: group.field.expression,
        aggregate_function: group.fn,
        aggregate_on_doctype: group.aggregate.doctype,
        aggregate_on_field: group.aggregate.fieldname,
      })
    const rows: Row[] = []
    for (let start = 0; start <= 10000; start += 200) {
      const page = await rpc("frappe.desk.reportview.get_list", {
        ...params,
        start: String(start),
      })
      if (
        !Array.isArray(page) ||
        page.length > 200 ||
        page.some((r) => !r || typeof r !== "object" || Array.isArray(r))
      )
        throw new ERPNextError("ERP returned invalid Report Builder rows.")
      if (rows.length + page.length > 10000)
        throw new ERPNextError(
          "Report exceeds 10,000 rows. Narrow its filters; no partial result was returned.",
          413,
        )
      rows.push(...page)
      if (page.length < 200) break
    }
    const columns = selected.map((f, i) => ({
      fieldname:
        f.doctype === parent ? f.fieldname : `${f.doctype}:${f.fieldname}`,
      label: f.label,
      fieldtype: f.fieldtype,
      options: f.options,
      alias: `c${i}`,
    }))
    if (group)
      columns.push({
        fieldname: "_aggregate_column",
        label: `${group.fn} ${group.aggregate.label}`,
        fieldtype: group.fn === "count" ? "Int" : group.aggregate.fieldtype,
        options: group.aggregate.options,
        alias: "_aggregate_column",
      })
    if (
      rows.some((row) =>
        columns.some(
          (col) => !Object.hasOwn(row, col.alias) || !scalar(row[col.alias]),
        ),
      )
    )
      throw new ERPNextError(
        "ERP omitted a selected report field or returned an unsupported cell. Check the saved layout and field permissions.",
        409,
      )
    return {
      report: description.name,
      filters,
      columns: columns.map(({ alias: _alias, ...col }) => col),
      rows: rows.map((r) =>
        Object.fromEntries(
          columns
            .filter((c) => scalar(r[c.alias]))
            .map((c) => [c.fieldname, r[c.alias]]),
        ),
      ),
      rowCount: rows.length,
      totalRowIncluded: false,
      scope: description.scope,
      note: "Complete saved Report Builder result within the 10,000-row limit. Saved filters are combined with additional filters. Supported grouping is executed by Frappe; presentation totals, saved sorting/charts and custom formatting are not reproduced. Non-grouped rows use stable record-name ordering.",
      provenance: provenance("report", description.name, {
        filters,
        doctype: parent,
      }),
    }
  }
  function provenance(kind: string, source: string, detail: Row = {}) {
    return {
      kind: "native-erp",
      type: kind,
      source,
      retrievedAt: new Date().toISOString(),
      ...detail,
    }
  }
  function scopeNote(meta: Meta) {
    return meta.fields.some(
      (f) => f.fieldtype === "Link" && f.options === "Company",
    )
      ? "ERP-wide access under native account permissions; records may span companies. Check each record's Company."
      : "Shared or custom source without a Company link; native account permissions apply."
  }
  async function describe(doctype: string) {
    const docs = await bundle(doctype),
      meta = docs[0]
    return {
      doctype,
      module: meta.module,
      scope: scopeNote(meta),
      fields: readable(meta).map((f) => ({
        fieldname: f.fieldname,
        label: f.label,
        fieldtype: f.fieldtype,
        options: f.options,
        required: !!f.reqd,
      })),
      childTables: docs
        .slice(1)
        .filter((child) =>
          readable(meta).some(
            (f) => f.fieldtype.startsWith("Table") && f.options === child.name,
          ),
        )
        .map((child) => ({
          doctype: child.name,
          fields: readable(child, undefined, meta).map((f) => ({
            fieldname: f.fieldname,
            label: f.label,
            fieldtype: f.fieldtype,
            options: f.options,
          })),
        })),
      provenance: provenance("schema", doctype),
    }
  }
  function checkedFilters(meta: Meta, filters: unknown): Filter[] {
    if (!Array.isArray(filters) || filters.length > 20)
      throw new ERPNextError("Use at most 20 structured filters.", 400)
    const allowed = new Set([
      ...systemFields,
      ...readable(meta)
        .filter((f) => !f.fieldtype.startsWith("Table"))
        .map((f) => f.fieldname),
    ])
    return filters.map((f) => {
      if (
        !Array.isArray(f) ||
        f.length !== 3 ||
        !allowed.has(f[0]) ||
        ![
          "=",
          "!=",
          ">",
          ">=",
          "<",
          "<=",
          "like",
          "not like",
          "in",
          "not in",
          "between",
          "is",
        ].includes(f[1]) ||
        !(
          scalar(f[2]) ||
          (Array.isArray(f[2]) && f[2].length <= 100 && f[2].every(scalar))
        ) ||
        JSON.stringify(f).length > 4000
      )
        throw new ERPNextError(
          "Invalid filter or field. Describe the DocType first.",
          400,
        )
      return f as Filter
    })
  }
  async function search(
    doctype: string,
    input: {
      search?: string
      fields?: string[]
      filters?: unknown
      offset?: number
      limit?: number
      orderBy?: "name asc" | "modified desc, name asc"
    },
  ) {
    if (
      input.orderBy !== undefined &&
      !["name asc", "modified desc, name asc"].includes(input.orderBy)
    )
      throw new ERPNextError("Invalid record ordering.", 400)
    const meta = (await bundle(doctype))[0]
    const available = readable(meta).filter(
      (f) => !f.fieldtype.startsWith("Table"),
    )
    const allowed = new Set([
      ...systemFields,
      ...available.map((f) => f.fieldname),
    ])
    const filters = checkedFilters(meta, input.filters ?? [])
    const companyFilter = filters.find(
      (f) => f[0] === "company" && f[1] === "=",
    )
    const fields = input.fields?.length
      ? [
          ...new Set([
            "name",
            "modified",
            ...input.fields,
            ...(companyFilter ? ["company"] : []),
          ]),
        ]
      : [
          "name",
          "modified",
          ...available
            .filter((f) =>
              ["company", "status", "workflow_state"].includes(f.fieldname),
            )
            .map((f) => f.fieldname),
        ]
    if (fields.length > 30 || fields.some((f) => !allowed.has(f)))
      throw new ERPNextError(
        "Unknown or restricted field. Describe the DocType first.",
        400,
      )
    const limit = input.limit ?? 20,
      offset = input.offset ?? 0
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 100000
    )
      throw new ERPNextError("Invalid page. Use 1 to 100 records.", 400)
    const text = input.search || ""
    if (text.length > 200)
      throw new ERPNextError("Search text is too long.", 400)
    const searchFields = [
      "name",
      ...available
        .filter((f) => ["Data", "Link", "Select"].includes(f.fieldtype))
        .slice(0, 6)
        .map((f) => f.fieldname),
    ]
    const rows = await erp.page<Row>(doctype, {
      fields,
      filters,
      orFilters: text
        ? searchFields.map((f): Filter => [
            f,
            "like",
            `%${text.replace(/[\\%_]/g, "\\$&")}%`,
          ])
        : [],
      orderBy: input.orderBy ?? "modified desc, name asc",
      offset,
      limit: limit + 1,
    })
    if (
      rows.some((row) => typeof row.name !== "string" || !row.name.trim()) ||
      new Set(rows.map((row) => row.name)).size !== rows.length
    )
      throw new ERPNextError(
        "ERP returned missing or duplicate record identities.",
        502,
      )
    if (companyFilter && rows.some((row) => row.company !== companyFilter[2]))
      throw new ERPNextError(
        "ERP returned records outside the requested company filter.",
        403,
      )
    const records = rows
      .slice(0, limit)
      .map((row) =>
        Object.fromEntries(
          fields.filter((f) => scalar(row[f])).map((f) => [f, row[f]]),
        ),
      )
    return {
      doctype,
      records,
      hasMore: rows.length > limit,
      offset,
      limit,
      nextOffset: rows.length > limit ? offset + limit : null,
      scope: scopeNote(meta),
      note: "A page of records, not a complete financial total.",
      provenance: provenance("records", doctype, {
        names: records.map((r) => r.name),
        fields,
        query: input,
      }),
    }
  }
  async function document(doctype: string, name: string) {
    const docs = await bundle(doctype),
      meta = docs[0],
      doc = await get(doctype, name)
    function project(row: Row, schema: Meta, depth: number): Row {
      if (depth > 2) return {}
      const output: Row = Object.fromEntries(
        systemFields
          .filter((key) => scalar(row[key]))
          .map((key) => [key, row[key]]),
      )
      for (const f of readable(schema, doc.owner, meta)) {
        const v = row[f.fieldname]
        if (f.fieldtype.startsWith("Table") && Array.isArray(v)) {
          const child = docs.find((m) => m.name === f.options)
          if (child) {
            if (v.length > 1000)
              throw new ERPNextError(
                "Document has too many child rows for this view. Use a narrower ERP report.",
                413,
              )
            output[f.fieldname] = v.map((r) => project(r, child, depth + 1))
          }
        } else if (scalar(v)) output[f.fieldname] = v
      }
      return output
    }
    const values = project(doc, meta, 0)
    return {
      doctype,
      name,
      values,
      scope: scopeNote(meta),
      provenance: provenance("document", doctype, {
        names: [name],
        fields: Object.keys(values),
      }),
    }
  }
  async function sources(
    query: string,
    kind: "all" | "doctype" | "report" = "all",
    offset = 0,
    limit = 20,
  ) {
    if (
      query.length > 200 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 100000 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    )
      throw new ERPNextError("Invalid source search.", 400)
    const found: Row[] = []
    if (kind !== "report") {
      const rows = await erp.list<Row>("DocType", {
        fields: ["name", "module", "custom", "istable", "issingle"],
        filters: [
          ["istable", "=", 0],
          ["issingle", "=", 0],
        ],
      })
      found.push(
        ...rows
          .filter((r) => safeBusinessType(r as Meta))
          .map((r) => ({
            kind: "doctype",
            name: r.name,
            module: r.module,
            custom: !!r.custom,
          })),
      )
    }
    if (kind !== "doctype") {
      const rows = await erp.list<Row>("Report", {
        fields: ["name", "module", "report_type", "ref_doctype"],
        filters: [["disabled", "=", 0]],
      })
      found.push(
        ...rows
          .filter(
            (r) =>
              !secretField(r.name) &&
              safeBusinessType({ name: r.ref_doctype, module: r.module }),
          )
          .map((r) => ({
            kind: "report",
            name: r.name,
            module: r.module,
            reportType: r.report_type,
            doctype: r.ref_doctype,
          })),
      )
    }
    const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
    const matches = found
      .map((r) => ({
        r,
        score: words.reduce(
          (n, w) =>
            n +
            (String(r.name).toLocaleLowerCase().includes(w) ? 3 : 0) +
            (`${r.module} ${r.doctype || ""}`.toLocaleLowerCase().includes(w)
              ? 1
              : 0),
          0,
        ),
      }))
      .filter(({ score }) => !words.length || score > 0)
      .sort((a, b) => b.score - a.score || a.r.name.localeCompare(b.r.name))
    const candidates = matches.slice(offset, offset + limit).map(({ r }) => r)
    // Discovery is metadata, not proof of report/record permission. Check a
    // bounded page concurrently, then recheck native access on every actual read.
    const permissions = new Map<string, Promise<boolean>>()
    const results: Row[] = []
    for (let start = 0; start < candidates.length; start += 4)
      results.push(
        ...(await Promise.all(
          candidates.slice(start, start + 4).map(async (r) => {
            try {
              const dt = r.kind === "doctype" ? r.name : r.doctype
              if (!permissions.has(dt)) permissions.set(dt, erp.canRead(dt))
              return {
                ...r,
                canRead: await permissions.get(dt),
                executionPermission:
                  r.kind === "report"
                    ? "Checked by ERP when describing/running the report"
                    : undefined,
              }
            } catch (e) {
              if (e instanceof ERPNextError && e.status === 403)
                return { ...r, canRead: false }
              throw e
            }
          }),
        )),
      )
    return {
      results,
      totalMatches: matches.length,
      hasMore: matches.length > offset + limit,
      offset,
      limit,
      nextOffset: matches.length > offset + limit ? offset + limit : null,
      note: "Source metadata may be discoverable even when its records or report execution are denied. Disabled reports, security settings and standalone child tables are excluded.",
    }
  }
  async function attachments(
    doctype: string,
    name: string,
    offset = 0,
    limit = 20,
  ) {
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 100000 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new ERPNextError(
        "Invalid attachment page. Use 1 to 100 files.",
        400,
      )
    await document(doctype, name)
    const rows = await erp.page<Row>("File", {
      fields: ["name", "file_name", "file_size", "is_private"],
      filters: [
        ["attached_to_doctype", "=", doctype],
        ["attached_to_name", "=", name],
      ],
      offset,
      limit: limit + 1,
      orderBy: "name asc",
    })
    if (
      rows.some(
        (r) =>
          typeof r.name !== "string" ||
          !r.name.trim() ||
          typeof r.file_name !== "string" ||
          !r.file_name.trim(),
      ) ||
      new Set(rows.map((r) => r.name)).size !== rows.length
    )
      throw new ERPNextError("ERP returned invalid attachment identities.", 502)
    return {
      doctype,
      name,
      files: rows.slice(0, limit).map((r) => ({
        name: r.name as string,
        file_name: r.file_name as string,
        file_size:
          typeof r.file_size === "number" &&
          Number.isFinite(r.file_size) &&
          r.file_size >= 0
            ? r.file_size
            : null,
        is_private: r.is_private === true || r.is_private === 1,
      })),
      offset,
      limit,
      hasMore: rows.length > limit,
      nextOffset: rows.length > limit ? offset + limit : null,
      note: "Only this document's permitted attachment metadata is listed. Downloads recheck file and parent permissions; no file URL or credentials are returned.",
      provenance: provenance("attachments", doctype, {
        names: [name],
        query: { offset, limit },
      }),
    }
  }
  async function report(name: string) {
    identifier(name)
    const rows = await erp.page<Row>("Report", {
      fields: ["name", "report_type", "ref_doctype", "disabled", "module"],
      filters: [["name", "=", name]],
      offset: 0,
      limit: 1,
    })
    const meta = rows[0]
    if (!meta || meta.disabled)
      throw new ERPNextError("Enabled report not found.", 404)
    if (!safeBusinessType({ name: meta.ref_doctype, module: meta.module }))
      throw new ERPNextError(
        "Reports on security or settings sources are unavailable.",
        403,
      )
    await bundle(meta.ref_doctype)
    const script = await rpc("frappe.desk.query_report.get_script", {
      report_name: name,
    })
    if (!script || typeof script !== "object")
      throw new ERPNextError("ERP returned invalid report metadata.")
    if (meta.report_type === "Report Builder") {
      const definition = await get("Report", name),
        saved = builderSettings(definition.json)
      const fields = builderFields(
          await bundle(meta.ref_doctype),
          meta.ref_doctype,
        ),
        selected = selectedBuilderFields(
          saved.fields,
          fields,
          meta.ref_doctype,
        ),
        group = saved.group_by
          ? checkedGroup(saved.group_by, fields, meta.ref_doctype)
          : null
      return {
        name,
        reportType: meta.report_type,
        doctype: meta.ref_doctype,
        supported: true,
        defaultFilters: {},
        filters: fields
          .filter((f) => f.doctype === meta.ref_doctype)
          .map((f) => ({
            fieldname: f.fieldname,
            label: f.label,
            fieldtype: f.fieldtype,
            options: f.options,
            required: false,
          })),
        savedFields: selected.map((f) => [f.fieldname, f.doctype]),
        savedFilters: safeBuilderFilters(
          saved.filters || [],
          fields,
          meta.ref_doctype,
        ),
        groupBy: group
          ? {
              field: group.field.fieldname,
              doctype: group.field.doctype,
              aggregateFunction: group.fn,
              aggregateField: group.aggregate.fieldname,
              aggregateDoctype: group.aggregate.doctype,
            }
          : null,
        scope:
          "Saved Report Builder fields and filters under native record/report permissions. Additional filters are combined with the saved filters; they do not replace them. Results can span companies unless the report filters exclude them.",
        note: "Additional filters use exact parent field names with a scalar, a list, or [operator,value], for example posting_date: ['between',['2026-10-01','2026-10-31']]. Saved grouping uses native count/sum/avg. Presentation totals, chart settings and custom formatting are not reproduced.",
        provenance: provenance("report-schema", name),
      }
    }
    const definitions = [
      ...(Array.isArray(script.filters) ? script.filters : []),
      ...reportScriptFilters(
        typeof script.script === "string" ? script.script : "",
      ),
    ]
    const filters = [
      ...new Map<string, MetaField>(
        definitions
          .filter(
            (f: MetaField) =>
              f &&
              typeof f.fieldname === "string" &&
              !secretField(f.fieldname, f.fieldtype),
          )
          .map((f: MetaField) => [f.fieldname, f]),
      ).values(),
    ].map((f) => ({
      fieldname: f.fieldname,
      label: f.label,
      fieldtype: f.fieldtype,
      options: f.options,
      required: !!f.reqd,
    }))
    const defaultFilters =
      meta.report_type === "Custom Report"
        ? reportFilters(
            builderSettings((await get("Report", name)).json).filters || {},
            [],
          )
        : {}
    return {
      name,
      reportType: meta.report_type,
      doctype: meta.ref_doctype,
      supported: true,
      filters,
      defaultFilters,
      scope:
        "ERP-native report permissions and filters apply. Custom reports may ignore a Company filter or use fixed dates; no company-only or selected-period guarantee is made.",
      note: filters.length
        ? "Supply exact required filters. Javascript defaults are not evaluated."
        : "No static filter definitions were available. Ask for required dates/filters if ERP rejects execution.",
      provenance: provenance("report-schema", name),
    }
  }
  async function runReport(name: string, input: Record<string, unknown>) {
    const description = await report(name)
    if (!description.supported) throw new ERPNextError(description.note, 409)
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new ERPNextError("Invalid report filters.", 400)
    const filters = reportFilters(
      { ...description.defaultFilters, ...input },
      description.filters || [],
      description.reportType === "Report Builder",
    )
    if (description.reportType === "Report Builder")
      return runBuilder(description, filters)
    const result = await rpc("frappe.desk.query_report.run", {
      report_name: name,
      filters: JSON.stringify(filters),
      ignore_prepared_report: "1",
      are_default_filters: "0",
    })
    if (
      !result ||
      !Array.isArray(result.columns) ||
      !Array.isArray(result.result) ||
      result.prepared_report ||
      result.result.length > 10000
    )
      throw new ERPNextError(
        "Report is not immediately available or exceeds 10,000 rows. Narrow its filters; no partial report is returned.",
        413,
      )
    const columns = result.columns
      .filter(
        (c: Row) =>
          typeof c.fieldname === "string" &&
          !secretField(c.fieldname, c.fieldtype) &&
          !secretField(String(c.label || "")),
      )
      .map((c: Row) => ({
        fieldname: c.fieldname,
        label: c.label || c.fieldname,
        fieldtype: c.fieldtype,
        options: c.options,
      }))
    const rows = result.result.map((row: Row) => {
      if (!row || typeof row !== "object")
        throw new ERPNextError("Report returned invalid rows.")
      // Frappe v14 can append an array total row after normalizing detail rows
      // to dictionaries. Preserve original column indices before projecting.
      const normalized = Array.isArray(row)
        ? Object.fromEntries(
            result.columns.map((c: Row, index: number) => [
              c.fieldname,
              row[index],
            ]),
          )
        : row
      return Object.fromEntries(
        columns
          .filter((c: Row) => scalar(normalized[c.fieldname]))
          .map((c: Row) => [c.fieldname, normalized[c.fieldname]]),
      )
    })
    return {
      report: name,
      filters,
      columns,
      rows,
      rowCount: rows.length,
      totalRowIncluded: !!result.add_total_row,
      scope: description.scope,
      note: "Totals, if present, are supplied by ERP. Rows include the native total row when totalRowIncluded is true; do not sum it again.",
      provenance: provenance("report", name, {
        filters,
        doctype: description.doctype,
      }),
    }
  }
  async function approvals(doctype: string, name: string) {
    const record = await document(doctype, name)
    const workflows = await erp.page<Row>("Workflow", {
      fields: ["name", "workflow_state_field"],
      filters: [
        ["document_type", "=", doctype],
        ["is_active", "=", 1],
      ],
      offset: 0,
      limit: 2,
    })
    if (workflows.length > 1)
      throw new ERPNextError(
        "Multiple active workflows were returned; review the ERP workflow configuration.",
        409,
      )
    if (!workflows.length)
      return {
        doctype,
        name,
        workflow: null,
        docstatus: record.values.docstatus,
        note: "No active native workflow was found. This does not prove all operational approvals are complete.",
        provenance: record.provenance,
      }
    const workflow = await get("Workflow", workflows[0].name)
    const state = record.values[workflow.workflow_state_field]
    if (typeof state !== "string" || !state)
      throw new ERPNextError(
        "Workflow state is missing or restricted on this record.",
        409,
      )
    const transitions = (workflow.transitions || []).map((t: Row) => ({
      state: t.state,
      action: t.action,
      nextState: t.next_state,
      approverRole: t.allowed,
      conditional: !!t.condition,
      selfApprovalAllowed: !!t.allow_self_approval,
    }))
    const available = await rpc("frappe.model.workflow.get_transitions", {
      doc: JSON.stringify({ doctype, name }),
    })
    if (!Array.isArray(available))
      throw new ERPNextError("ERP returned invalid workflow transitions.")
    if (
      available.some(
        (t: Row) => typeof t.state === "string" && t.state !== state,
      )
    )
      throw new ERPNextError(
        "Workflow changed while being read. Refresh this record.",
        409,
      )
    const immediate = transitions.filter((t: Row) => t.state === state)
    // Reachable states are a graph of possibilities, not a promised approval path.
    const reachable = new Set<string>([state]),
      remaining: Row[] = []
    for (let pass = 0; pass < transitions.length; pass++) {
      let changed = false
      for (const t of transitions)
        if (reachable.has(t.state) && !reachable.has(t.nextState)) {
          reachable.add(t.nextState)
          changed = true
        }
      if (!changed) break
    }
    for (const t of transitions) if (reachable.has(t.state)) remaining.push(t)
    return {
      doctype,
      name,
      modified: record.values.modified,
      workflow: workflow.name,
      currentState: state,
      docstatus: record.values.docstatus,
      immediateCandidates: immediate,
      possibleRemainingTransitions: remaining,
      availableToCurrentUser: available
        .filter(
          (t: Row) =>
            context.user === "Administrator" ||
            t.allow_self_approval ||
            record.values.owner !== context.user,
        )
        .map((t: Row) => ({
          action: t.action,
          nextState: t.next_state,
          approverRole: t.allowed,
        })),
      note: "Candidate roles are not named assigned approvers. Conditions for other roles and future states have not been evaluated. Branches can include rejection, cancellation or loops. Available-to-user transitions are evaluated by ERP now; all execution remains disabled. No outgoing transition alone is not proof of final approval.",
      provenance: { ...record.provenance, type: "approvals" },
    }
  }
  async function permission(
    doctype: string,
    name: string,
    type: "print" | "export",
  ) {
    // Mirrors frappe.permissions.can_export in Frappe v14. System Manager is
    // explicitly allowed there even when DocType.has_permission('export') is false.
    // Report execution/read permissions are still checked independently.
    if (type === "export" && context.roles.includes("System Manager")) return
    const result = await rpc("frappe.client.has_permission", {
      doctype,
      docname: name,
      perm_type: type,
    })
    if (result?.has_permission !== true)
      throw new ERPNextError(`ERP ${type} permission denied.`, 403)
  }
  return {
    sources,
    describe,
    search,
    document,
    report,
    runReport,
    approvals,
    attachments,
    permission,
  }
}
