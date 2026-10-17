import type { ERPDocument } from "./model"
import { ERPNextError } from "./erpnext-error"
import { denyERPWrite } from "./erp-access"
import { requestBody } from "./request-body"
import { validateERPFilePath } from "./erp-file-path"
export { ERPNextError } from "./erpnext-error"

export type Filter = [string, string, string | number | string[]]
type Query = {
  fields: string[]
  filters?: Filter[]
  orFilters?: Filter[]
  orderBy?: string
}

// Used only by the server. The SID never enters snapshot JSON or client props.
export class ERPNextClient {
  constructor(
    private siteUrl: string,
    private sid: string,
    private fetcher: typeof fetch = fetch,
  ) {}

  async request(
    path: string,
    options?: { method: "POST"; body: unknown; csrf?: string },
  ) {
    if (path.length > 7000)
      throw new ERPNextError(
        "ERP query is too long. Use fewer fields or shorter filters.",
        400,
      )
    if (options) {
      const operation = path.match(
        /^\/api\/method\/ceopanel_bridge\.api\.([a-z_]+)$/,
      )?.[1]
      if (!operation || !READ_BRIDGE_OPERATIONS.has(operation)) denyERPWrite()
    }
    let response: Response
    try {
      response = await this.fetcher(`${this.siteUrl}${path}`, {
        method: options?.method,
        body: options ? JSON.stringify(options.body) : undefined,
        headers: {
          Cookie: `sid=${this.sid}`,
          Accept: "application/json",
          ...(options
            ? {
                "Content-Type": "application/json",
                "X-Frappe-CSRF-Token": options.csrf || "",
              }
            : {}),
        },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      })
    } catch {
      throw new ERPNextError(
        "ERPNext could not be reached. Please try refreshing.",
      )
    }
    if (response.status === 401)
      throw new ERPNextError(
        "Your ERPNext session expired. Please sign in again.",
        401,
      )
    if (response.status === 403)
      throw new ERPNextError(
        "Your ERPNext account does not have permission to read these records.",
        403,
      )
    if (response.status === 404)
      throw new ERPNextError(
        "This module is unavailable on your ERPNext site.",
        404,
      )
    if (!response.ok)
      throw new ERPNextError(
        "ERPNext could not load these records. Please try refreshing.",
      )
    try {
      return JSON.parse(
        (
          await requestBody(
            response,
            16 * 1024 * 1024,
            "ERP response exceeds 16 MB. Narrow the request.",
          )
        ).toString("utf8"),
      )
    } catch (cause) {
      if (cause instanceof ERPNextError) throw cause
      throw new ERPNextError("ERPNext returned an invalid response.")
    }
  }

  async bridge<T>(operation: string, args: unknown = {}): Promise<T> {
    if (!/^[a-z_]+$/.test(operation))
      throw new ERPNextError("Invalid ERP operation.", 400)
    if (!READ_BRIDGE_OPERATIONS.has(operation)) denyERPWrite()
    const token = await this.request("/api/method/ceopanel_bridge.api.csrf")
    if (typeof token.message !== "string")
      throw new ERPNextError("ERP session verification failed.", 401)
    const body = await this.request(
      `/api/method/ceopanel_bridge.api.${operation}`,
      { method: "POST", body: args, csrf: token.message },
    )
    if (body.message === undefined)
      throw new ERPNextError("ERP bridge returned an invalid response.")
    return body.message as T
  }

  async user(): Promise<string> {
    let body
    try {
      body = await this.request("/api/method/frappe.auth.get_logged_user")
    } catch (cause) {
      // Frappe v14 rejects an invalid SID with 403 at this identity endpoint.
      // A 403 from an ordinary record query remains a permission error.
      if (cause instanceof ERPNextError && cause.status === 403)
        throw new ERPNextError(
          "Your ERPNext session expired. Please sign in again.",
          401,
        )
      throw cause
    }
    if (typeof body.message !== "string" || body.message === "Guest")
      throw new ERPNextError("Please sign in to ERPNext.", 401)
    return body.message
  }

  async roles(): Promise<string[]> {
    const user = await this.user()
    const params = new URLSearchParams({ doctype: "User", name: user })
    const body = await this.request(`/api/method/frappe.client.get?${params}`)
    const doc = body.message
    if (
      doc?.name !== user ||
      !Array.isArray(doc.roles) ||
      doc.roles.some((r: { role?: unknown }) => typeof r.role !== "string")
    )
      throw new ERPNextError("ERP role configuration is invalid.")
    return [
      ...new Set<string>([
        ...doc.roles.map((r: { role: string }) => r.role),
        "All",
        ...(doc.user_type === "System User" ? ["Desk User"] : []),
      ]),
    ]
  }

  async binary(path: string, limit = 6 * 1024 * 1024): Promise<Buffer> {
    // No arbitrary URLs, redirects, print HTML, filesystem paths or RPC methods.
    validateERPFilePath(path, true)
    let response: Response
    try {
      response = await this.fetcher(`${this.siteUrl}${path}`, {
        headers: { Cookie: `sid=${this.sid}` },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(60000),
      })
    } catch {
      throw new ERPNextError("ERP could not generate or download this file.")
    }
    if (!response.ok)
      throw new ERPNextError(
        "ERP file access or generation failed.",
        [401, 403, 404].includes(response.status) ? response.status : 502,
      )
    return requestBody(
      response,
      limit,
      "ERP file exceeds the 6 MB delivery limit.",
    )
  }

  async canRead(doctype: string): Promise<boolean> {
    const params = new URLSearchParams({
      doctype,
      docname: "",
      perm_type: "read",
    })
    const body = await this.request(
      `/api/method/frappe.client.has_permission?${params}`,
    )
    if (typeof body.message?.has_permission !== "boolean")
      throw new ERPNextError("ERPNext returned invalid permissions.")
    return body.message.has_permission
  }

  async page<T = ERPDocument>(
    doctype: string,
    query: Query & { offset: number; limit: number },
  ): Promise<T[]> {
    if (
      !Number.isSafeInteger(query.offset) ||
      query.offset < 0 ||
      !Number.isSafeInteger(query.limit) ||
      query.limit < 1 ||
      query.limit > 201
    )
      throw new ERPNextError("Invalid record query.", 400)
    const params = new URLSearchParams({
      fields: JSON.stringify(query.fields),
      filters: JSON.stringify(query.filters ?? []),
      or_filters: JSON.stringify(query.orFilters ?? []),
      order_by: query.orderBy ?? "name asc",
      limit_start: String(query.offset),
      limit_page_length: String(query.limit),
    })
    const body = await this.request(
      `/api/resource/${encodeURIComponent(doctype)}?${params}`,
    )
    if (
      !Array.isArray(body.data) ||
      body.data.length > query.limit ||
      body.data.some(
        (row: unknown) => !row || typeof row !== "object" || Array.isArray(row),
      )
    )
      throw new ERPNextError("ERPNext returned an invalid record list.")
    return body.data as T[]
  }

  async list<T = ERPDocument>(doctype: string, query: Query): Promise<T[]> {
    const pageSize = 200
    const maxRecords = 10000
    const all: T[] = []
    const names = new Set<string>()
    for (let start = 0; start <= maxRecords; start += pageSize) {
      const rows = await this.page<T>(doctype, {
        ...query,
        offset: start,
        limit: pageSize,
      })
      if (all.length + rows.length > maxRecords) {
        throw new ERPNextError(
          "More than 10,000 records match this view. Choose a shorter period or use an ERPNext report. Totals are unavailable.",
        )
      }
      if (query.fields.includes("name"))
        for (const row of rows) {
          const name = (row as Record<string, unknown>).name
          if (typeof name !== "string" || !name || names.has(name))
            throw new ERPNextError(
              "ERPNext returned missing or duplicate record identities. Refresh this view.",
              409,
            )
          names.add(name)
        }
      all.push(...rows)
      if (rows.length < pageSize) return all
    }
    throw new ERPNextError(
      "ERPNext pagination did not finish. Totals are unavailable.",
    )
  }
}

const READ_BRIDGE_OPERATIONS = new Set([
  "roles",
  "schema",
  "records",
  "record",
  "links",
  "ai_records",
  "report",
  "dashboard",
  "proposal_receipt",
  "discovery",
  "evidence_access",
])
