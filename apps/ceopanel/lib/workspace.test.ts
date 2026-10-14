import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const companyContext = vi.hoisted(() => ({
  user: "ceo@example.com",
  company: "Company A",
  currency: "SAR",
  companies: [{ name: "Company A", default_currency: "SAR" }],
  siteUrl: "https://example.frappe.cloud",
}))
const loadContext = vi.hoisted(() => vi.fn(async () => companyContext))
vi.mock("./dashboard-server", () => ({ loadContext }))
import {
  pendingSchema,
  requiredValues,
  standardModules,
  validateValues,
  type ModuleSchema,
  type WorkspaceRecord,
} from "./workspace"
import {
  customModules,
  customReports,
  reportAdapters,
  workspaceAction,
  workspaceAdapters,
  workspaceGet,
  workspaceList,
  workspaceReport,
  workspaceSave,
  workspaceSchema,
} from "./workspace-server"
import { POST } from "../app/api/workspace/modules/[moduleId]/records/route"

const schema: ModuleSchema = {
  ...pendingSchema(standardModules[0]),
  ready: true,
  companyField: "company",
  submittable: true,
  fields: [
    {
      name: "customer_name",
      label: "Customer name",
      type: "text",
      required: true,
    },
    { name: "company", label: "Company", type: "text" },
    {
      name: "custom_tier",
      label: "Tier",
      type: "select",
      options: ["Gold", "Silver"],
    },
    { name: "notes", label: "Notes", type: "textarea", allowOnSubmit: true },
    {
      name: "contacts",
      label: "Contacts",
      type: "table",
      fields: [
        { name: "full_name", label: "Full name", type: "text", required: true },
      ],
    },
  ],
  permissions: {
    read: true,
    create: true,
    edit: true,
    submit: true,
    cancel: true,
  },
}
let existing: WorkspaceRecord
let adapter: (typeof workspaceAdapters)[string]
beforeEach(() => {
  existing = {
    name: "CUSTOMER-1",
    modified: "2026-10-14T10:00:00",
    docstatus: 0,
    values: { customer_name: "Customer A", company: "Company A" },
  }
  adapter = {
    schema: vi.fn(async () => structuredClone(schema)),
    list: vi.fn(async () => ({ records: [existing], hasMore: false })),
    get: vi.fn(async () => existing),
    create: vi.fn(async (_context, values) => ({ ...existing, values })),
    update: vi.fn(async (_context, _name, values) => ({
      ...existing,
      values: { ...existing.values, ...values },
    })),
    action: vi.fn(async (_context, _name, action) => ({
      ...existing,
      docstatus: action === "submit" ? 1 : 2,
    })),
  }
  workspaceAdapters.customers = adapter
  loadContext.mockClear()
})
afterEach(() => {
  Object.keys(workspaceAdapters).forEach((key) => delete workspaceAdapters[key])
  Object.keys(reportAdapters).forEach((key) => delete reportAdapters[key])
  customModules.length = 0
  customReports.length = 0
})

describe("ERP workspace guardrails", () => {
  it("leaves unconfigured modules pending without requesting company data", async () => {
    delete workspaceAdapters.customers
    expect((await workspaceSchema("customers")).ready).toBe(false)
    await expect(
      workspaceSave("customers", undefined, { values: {} })
    ).rejects.toMatchObject({ status: 409 })
    expect(loadContext).not.toHaveBeenCalled()
  })
  it("forces the permitted company on new records and preserves custom fields and child rows", async () => {
    const result = await workspaceSave("customers", "Company A", {
      values: {
        customer_name: "New customer",
        company: "Company B",
        custom_tier: "Gold",
        contacts: [{ full_name: "Contact A" }],
      },
    })
    expect(result.values.company).toBe("Company A")
    expect(result.values.custom_tier).toBe("Gold")
    expect(result.values.contacts).toEqual([{ full_name: "Contact A" }])
    expect(adapter.create).toHaveBeenCalledWith(
      companyContext,
      expect.objectContaining({ company: "Company A" })
    )
  })
  it("blocks protected or unknown fields before writing", async () => {
    await expect(
      workspaceSave("customers", undefined, {
        values: { customer_name: "Customer", docstatus: 1 },
      })
    ).rejects.toMatchObject({ status: 400 })
    expect(adapter.create).not.toHaveBeenCalled()
    expect(() =>
      validateValues(JSON.parse('{"__proto__":{"admin":true}}'), schema.fields)
    ).toThrow()
  })
  it("validates required fields, select choices, and child-table fields", async () => {
    await expect(
      workspaceSave("customers", undefined, { values: { custom_tier: "Gold" } })
    ).rejects.toThrow("Customer name is required")
    expect(() =>
      validateValues({ custom_tier: "Admin" }, schema.fields)
    ).toThrow("Choose a valid")
    expect(() =>
      validateValues({ contacts: [{ owner: "Administrator" }] }, schema.fields)
    ).toThrow()
    expect(() =>
      requiredValues(
        { contacts: [{}] },
        schema.fields.filter((field) => field.name === "contacts")
      )
    ).toThrow("Full name is required")
  })
  it("refuses stale edits without calling the write adapter", async () => {
    await expect(
      workspaceSave("customers", undefined, {
        name: existing.name,
        values: { notes: "Changed" },
        modified: "old-timestamp",
      })
    ).rejects.toMatchObject({ status: 409 })
    expect(adapter.update).not.toHaveBeenCalled()
  })
  it("rejects documents and lists belonging to another company", async () => {
    existing.values.company = "Company B"
    await expect(
      workspaceGet("customers", existing.name)
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      workspaceList("customers", undefined, {
        search: "",
        offset: 0,
        limit: 20,
      })
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      workspaceSave("customers", undefined, {
        name: existing.name,
        values: { notes: "Changed" },
        modified: existing.modified,
      })
    ).rejects.toMatchObject({ status: 403 })
    expect(adapter.update).not.toHaveBeenCalled()
  })
  it("honors create and edit permissions", async () => {
    adapter.schema = vi.fn(async () => ({
      ...schema,
      permissions: { ...schema.permissions, create: false, edit: false },
    }))
    await expect(
      workspaceSave("customers", undefined, {
        values: { customer_name: "New" },
      })
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      workspaceSave("customers", undefined, {
        name: existing.name,
        values: { notes: "Changed" },
        modified: existing.modified,
      })
    ).rejects.toMatchObject({ status: 403 })
    expect(adapter.create).not.toHaveBeenCalled()
    expect(adapter.update).not.toHaveBeenCalled()
  })
  it("permits only allow-on-submit fields on submitted records", async () => {
    existing.docstatus = 1
    await expect(
      workspaceSave("customers", undefined, {
        name: existing.name,
        values: { customer_name: "Changed" },
        modified: existing.modified,
      })
    ).rejects.toMatchObject({ status: 400 })
    expect(
      (
        await workspaceSave("customers", undefined, {
          name: existing.name,
          values: { notes: "Updated note" },
          modified: existing.modified,
        })
      ).values.notes
    ).toBe("Updated note")
  })
  it("uses explicit submit/cancel actions with document-state and timestamp checks", async () => {
    expect(
      (
        await workspaceAction(
          "customers",
          existing.name,
          undefined,
          "submit",
          existing.modified
        )
      ).docstatus
    ).toBe(1)
    await expect(
      workspaceAction(
        "customers",
        existing.name,
        undefined,
        "cancel",
        existing.modified
      )
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      workspaceAction(
        "customers",
        existing.name,
        undefined,
        "frappe.delete_doc",
        existing.modified
      )
    ).rejects.toMatchObject({ status: 400 })
    existing.docstatus = 1
    expect(
      (
        await workspaceAction(
          "customers",
          existing.name,
          undefined,
          "cancel",
          existing.modified
        )
      ).docstatus
    ).toBe(2)
  })
  it("registers custom DocTypes without hardcoded standard field names", async () => {
    const module = {
      id: "site-visits",
      title: "Site Visits",
      doctype: "DM Site Visit",
      description: "Company visits",
      custom: true,
    }
    customModules.push(module)
    workspaceAdapters[module.id] = {
      ...adapter,
      schema: async () => ({ ...schema, module }),
    }
    expect((await workspaceSchema(module.id)).module.doctype).toBe(
      "DM Site Visit"
    )
  })
  it("scopes custom report filters and rejects arbitrary filters", async () => {
    customReports.push({
      id: "company-custom-report",
      title: "Company report",
      description: "Custom",
      companyField: "company",
      filters: [
        { name: "from_date", label: "From date", type: "date", required: true },
        { name: "company", label: "Company", type: "text" },
      ],
    })
    const report = vi.fn(async () => ({ columns: [], rows: [] }))
    reportAdapters["company-custom-report"] = report
    await workspaceReport("company-custom-report", "Company A", {
      from_date: "2026-10-01",
      company: "Company B",
    })
    expect(report).toHaveBeenCalledWith(companyContext, {
      from_date: "2026-10-01",
      company: "Company A",
    })
    await expect(
      workspaceReport("company-custom-report", undefined, { sql: "any query" })
    ).rejects.toMatchObject({ status: 400 })
  })
  it("rejects cross-site saves and invalid JSON before any adapter runs", async () => {
    const params = { params: Promise.resolve({ moduleId: "customers" }) }
    expect(
      (
        await POST(
          new Request(
            "https://panel.example/api/workspace/modules/customers/records",
            {
              method: "POST",
              headers: { Origin: "https://other.example" },
              body: "{}",
            }
          ),
          params
        )
      ).status
    ).toBe(403)
    expect(
      (
        await POST(
          new Request(
            "https://panel.example/api/workspace/modules/customers/records",
            {
              method: "POST",
              headers: { Origin: "https://panel.example" },
              body: "not-json",
            }
          ),
          params
        )
      ).status
    ).toBe(400)
    expect(adapter.create).not.toHaveBeenCalled()
  })
})
