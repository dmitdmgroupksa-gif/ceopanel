import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("../erpnext-server", () => ({ client: vi.fn() }))
import { nativeWorkspace } from "./workspace"
import { nativeModules } from "./catalog"
import type { NativeReadClient } from "./permissioned-reader"

const context = {
  user: "user@example.com",
  company: "Company A",
  currency: "SAR",
  companies: [],
  siteUrl: "https://example.frappe.cloud",
}
const row = {
  name: "ORDER-1",
  modified: "2026-10-15 10:00:00",
  docstatus: 0,
  company: "Company A",
  customer_name: "Customer",
  private_secret: "never-export",
}
function setup(rows: Record<string, unknown>[] = [row], readable = true) {
  const restricted = new Set<string>()
  const erp = {
    canRead: vi.fn(async () => readable),
    roles: vi.fn(async () => ["Employee"]),
    list: vi.fn(async () => []),
    request: vi.fn(async (raw: string) => {
      const doctype = new URL(raw, context.siteUrl).searchParams.get("doctype")!
      const mapping = nativeModules.find((m) => m.module.doctype === doctype)!
      return {
        docs: [
          {
            name: doctype,
            fields: [
              ...new Set([
                ...mapping.fields.map((f) => f.name),
                ...(mapping.scope === "company" ? ["company"] : []),
              ]),
            ].map((fieldname) => ({
              fieldname,
              fieldtype: "Data",
              permlevel: restricted.has(fieldname) ? 1 : 0,
            })),
            permissions: [],
          },
        ],
      }
    }),
    page: vi.fn(async (_doctype: string, query: { fields: string[] }) =>
      rows.map((row) => ({
        ...Object.fromEntries(query.fields.map((field) => [field, null])),
        ...row,
      })),
    ),
  }
  return {
    erp,
    restricted,
    adapters: nativeWorkspace(async () => erp as unknown as NativeReadClient),
  }
}
describe("native record adapters", () => {
  it("provides no write implementation for any registered module", async () => {
    const { adapters } = setup()
    for (const mapping of nativeModules) {
      const adapter = adapters[mapping.module.id]
      expect(adapter.create).toBeUndefined()
      expect(adapter.update).toBeUndefined()
      expect(adapter.action).toBeUndefined()
      const schema = await adapter.schema(context)
      expect(schema.permissions).toEqual({
        read: true,
        create: false,
        edit: false,
        submit: false,
        cancel: false,
      })
      expect(schema.fields.every((field) => field.readOnly)).toBe(true)
    }
  })
  it("uses native read permission without copying write grants", async () => {
    const { adapters } = setup([], false)
    const schema = await adapters["sales-orders"].schema(context)
    expect(schema.permissions.read).toBe(false)
  })
  it("enforces company filters, bounds a page and projects only allowed fields", async () => {
    const { adapters, erp } = setup([row, { ...row, name: "ORDER-2" }])
    const result = await adapters["sales-orders"].list(context, {
      search: "100%_",
      offset: 20,
      limit: 1,
    })
    expect(result.hasMore).toBe(true)
    expect(result.records).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain("never-export")
    expect(erp.page).toHaveBeenCalledWith(
      "Sales Order",
      expect.objectContaining({
        offset: 20,
        limit: 2,
        filters: [["company", "=", "Company A"]],
        orFilters: expect.arrayContaining([["name", "like", "%100\\%\\_%"]]),
      }),
    )
  })
  it("rejects cross-company responses, including a detail lookup", async () => {
    const { adapters } = setup([{ ...row, company: "Company B" }])
    await expect(
      adapters["sales-orders"].get(context, "ORDER-1"),
    ).rejects.toMatchObject({ status: 403 })
  })
  it("does not invent a company field for shared masters", async () => {
    const { adapters, erp } = setup([
      { ...row, customer_name: "Shared customer" },
    ])
    const schema = await adapters.customers.schema(context)
    expect(schema.scope).toBe("shared")
    expect(schema.companyField).toBeUndefined()
    await adapters.customers.list(context, { search: "", offset: 0, limit: 20 })
    expect(erp.page).toHaveBeenCalledWith(
      "Customer",
      expect.objectContaining({ filters: [] }),
    )
  })
  it("returns a scoped not-found result instead of fetching unrestricted documents", async () => {
    const { adapters, erp } = setup([])
    await expect(
      adapters["sales-orders"].get(context, "UNKNOWN"),
    ).rejects.toMatchObject({ status: 404 })
    expect(erp.page).toHaveBeenCalledWith(
      "Sales Order",
      expect.objectContaining({
        filters: [
          ["company", "=", "Company A"],
          ["name", "=", "UNKNOWN"],
        ],
        limit: 1,
      }),
    )
  })
  it("hides restricted columns from both schema and records even if ERP returns them", async () => {
    const { adapters, erp, restricted } = setup()
    restricted.add("customer_name")
    const schema = await adapters["sales-orders"].schema(context)
    expect(schema.fields.some((f) => f.name === "customer_name")).toBe(false)
    const result = await adapters["sales-orders"].list(context, {
      search: "Customer",
      offset: 0,
      limit: 20,
    })
    expect(result.records[0].values).not.toHaveProperty("customer_name")
    expect(erp.page.mock.calls.at(-1)![1].fields).not.toContain("customer_name")
  })
  it("rejects a mismatched detail identity and duplicate list rows", async () => {
    const { adapters } = setup([row])
    await expect(
      adapters["sales-orders"].get(context, "ANOTHER"),
    ).rejects.toMatchObject({ status: 409 })
    const duplicate = setup([row, row])
    await expect(
      duplicate.adapters["sales-orders"].list(context, {
        search: "",
        offset: 0,
        limit: 20,
      }),
    ).rejects.toMatchObject({ status: 409 })
  })
})
