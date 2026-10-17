import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { ERPNextClient } from "./erpnext-client"
import { denyERPWrite, ERP_READ_ONLY, readOnlySchema } from "./erp-access"
import { pendingSchema, standardModules } from "./workspace"
import { visibleTools } from "./mcp/server"
import { POST as create } from "../app/api/workspace/modules/[moduleId]/records/route"
import { PUT as edit } from "../app/api/workspace/modules/[moduleId]/records/[name]/route"
import { POST as action } from "../app/api/workspace/modules/[moduleId]/records/[name]/actions/route"

describe("application read-only boundary", () => {
  it("disables writes independently of environment configuration", () => {
    expect(ERP_READ_ONLY).toBe(true)
    expect(denyERPWrite).toThrow("read-only")
  })
  it("publishes only read tools to human MCP clients", () => {
    const entries = visibleTools({
      principal: "human",
      evidence: [],
      context: {
        user: "user@example.com",
        company: "Company A",
        currency: "SAR",
        companies: [],
        siteUrl: "https://example.frappe.cloud",
        roles: ["System Manager"],
      },
    })
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every(({ tool }) => tool.effect === "read")).toBe(true)
    expect(entries.map(({ tool }) => tool.name)).not.toContain("workspace_save")
    expect(entries.map(({ tool }) => tool.name)).not.toContain(
      "workspace_action",
    )
    expect(entries.map(({ tool }) => tool.name)).toEqual(
      expect.arrayContaining(["voice_session", "voice_speech"]),
    )
  })
  it("removes all native grants, nested editable fields and workflow actions", () => {
    const original = {
      ...pendingSchema(standardModules[0]),
      fields: [
        {
          name: "rows",
          label: "Rows",
          type: "table" as const,
          fields: [{ name: "value", label: "Value", type: "text" as const }],
        },
      ],
      permissions: {
        read: true,
        create: true,
        edit: true,
        submit: true,
        cancel: true,
      },
      workflowActions: ["Approve"],
    }
    const result = readOnlySchema(original)
    expect(result.permissions).toEqual({
      read: true,
      create: false,
      edit: false,
      submit: false,
      cancel: false,
    })
    expect(result.workflowActions).toEqual([])
    expect(result.fields[0].fields?.[0].readOnly).toBe(true)
    expect(original.permissions.create).toBe(true)
  })
  it.each(["save", "action", "execute_proposal", "unreviewed_operation"])(
    "blocks ERP bridge %s before any request",
    async (operation) => {
      const fetcher = vi.fn<typeof fetch>()
      await expect(
        new ERPNextClient(
          "https://example.frappe.cloud",
          "session",
          fetcher,
        ).bridge(operation),
      ).rejects.toMatchObject({ status: 403 })
      expect(fetcher).not.toHaveBeenCalled()
    },
  )
  it("blocks direct mutation requests before the network", async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(
      new ERPNextClient(
        "https://example.frappe.cloud",
        "session",
        fetcher,
      ).request("/api/resource/Customer", { method: "POST", body: {} }),
    ).rejects.toMatchObject({ status: 403 })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it("rejects create/edit/workflow HTTP calls before auth, parsing or tool dispatch", async () => {
    const request = () =>
      new Request(
        "https://panel.example/api/workspace/modules/customers/records",
        { method: "POST", body: "invalid json" },
      )
    const params = Promise.resolve({
      moduleId: "customers",
      name: "CUSTOMER-1",
    })
    for (const response of await Promise.all([
      create(request(), { params }),
      edit(request(), { params }),
      action(request(), { params }),
    ])) {
      expect(response.status).toBe(403)
      expect((await response.json()).error).toContain("read-only")
      expect(response.headers.get("cache-control")).toContain("no-store")
    }
  })
})
