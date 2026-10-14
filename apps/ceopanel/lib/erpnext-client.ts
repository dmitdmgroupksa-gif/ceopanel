import type { ERPDocument } from "./model"

export class ERPNextError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message)
  }
}

export type Filter = [string, string, string | number | string[]]
type Query = { fields: string[]; filters?: Filter[]; orderBy?: string }

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
      return await response.json()
    } catch {
      throw new ERPNextError("ERPNext returned an invalid response.")
    }
  }

  async bridge<T>(operation: string, args: unknown = {}): Promise<T> {
    if (!/^[a-z_]+$/.test(operation))
      throw new ERPNextError("Invalid ERP operation.", 400)
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
    const body = await this.request("/api/method/frappe.auth.get_logged_user")
    if (typeof body.message !== "string" || body.message === "Guest")
      throw new ERPNextError("Please sign in to ERPNext.", 401)
    return body.message
  }

  async list<T = ERPDocument>(doctype: string, query: Query): Promise<T[]> {
    const pageSize = 200
    const maxRecords = 10000
    const all: T[] = []
    for (let start = 0; start <= maxRecords; start += pageSize) {
      const params = new URLSearchParams({
        fields: JSON.stringify(query.fields),
        filters: JSON.stringify(query.filters ?? []),
        order_by: query.orderBy ?? "name asc",
        limit_page_length: String(pageSize),
        limit_start: String(start),
      })
      const body = await this.request(
        `/api/resource/${encodeURIComponent(doctype)}?${params}`,
      )
      if (!Array.isArray(body.data))
        throw new ERPNextError("ERPNext returned an invalid record list.")
      if (all.length + body.data.length > maxRecords) {
        throw new ERPNextError(
          "More than 10,000 records match this view. Choose a shorter period or use an ERPNext report. Totals are unavailable.",
        )
      }
      all.push(...body.data)
      if (body.data.length < pageSize) return all
    }
    throw new ERPNextError(
      "ERPNext pagination did not finish. Totals are unavailable.",
    )
  }
}
