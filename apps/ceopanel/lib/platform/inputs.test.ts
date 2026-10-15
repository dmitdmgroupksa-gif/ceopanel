import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const fixture = vi.hoisted(() => ({ config: {} as unknown, list: vi.fn() }))
vi.mock("./config", async (original) => {
  const actual = await original<typeof import("./config")>()
  return { ...actual, platformConfig: () => actual.parseConfig(fixture.config) }
})
vi.mock("../workspace-server", () => ({ workspaceList: fixture.list }))
import { externalAdapters, externalCatalog, readExternal } from "./external"
import { inputReadiness } from "./inputs"
import type { UserContext } from "./policy"
const user: UserContext = {
  user: "finance@example.com",
  company: "Durar",
  roles: ["Accounts Manager"],
  currency: "SAR",
  companies: [],
  siteUrl: "https://example.frappe.cloud",
}
beforeEach(() => {
  fixture.list.mockReset()
  fixture.config = {
    modules: [
      {
        id: "bank-transactions",
        title: "Bank Transactions",
        doctype: "Bank Transaction",
        fields: [],
        readValidated: true,
      },
    ],
    agents: {
      finance: { roles: ["Accounts Manager"], modules: ["bank-transactions"] },
    },
    externalSources: [
      {
        id: "bank-erp",
        title: "ERP banking",
        type: "bank",
        connection: "erpnext",
        country: "SA",
        roles: ["Accounts Manager"],
        modules: ["bank-transactions"],
        readValidated: true,
      },
      {
        id: "bank-provider",
        title: "Optional bank",
        type: "bank",
        connection: "provider",
        provider: "fixture",
        country: "SA",
        roles: ["Accounts Manager"],
        readValidated: true,
      },
    ],
  }
  delete externalAdapters["bank-provider"]
})
describe("ERP-first input configuration", () => {
  it("distinguishes mapped configuration from an actual live connection", () => {
    const readiness = inputReadiness(user)
    expect(readiness.primary).toBe("erpnext")
    expect(readiness.verification).toBe("configuration_inventory_only")
    expect(readiness.categories).toHaveLength(7)
    expect(readiness.categories.find((c) => c.id === "external")).toMatchObject(
      { mappedCount: 1, state: "mapped_awaiting_live_check" },
    )
    expect(
      readiness.categories.find((c) => c.id === "employees")?.modules,
    ).toEqual([])
    expect(fixture.list).not.toHaveBeenCalled()
  })
  it("delegates banking records to the company-scoped native ERP workspace and marks partial results", async () => {
    fixture.list.mockResolvedValue({
      records: [
        {
          name: "BANK-TXN-1",
          modified: "v1",
          values: {
            deposit: 10,
            currency: "SAR",
            hiddenChild: [{ internal: "no" }],
          },
        },
      ],
      hasMore: true,
    })
    const result = await readExternal(user, "bank-erp")
    expect(fixture.list).toHaveBeenCalledWith("bank-transactions", "Durar", {
      search: "",
      offset: 0,
      limit: 50,
    })
    expect(result).toMatchObject({
      company: "Durar",
      hasMore: true,
      records: [
        { module: "bank-transactions", name: "BANK-TXN-1", currency: "SAR" },
      ],
    })
    expect(JSON.stringify(result)).not.toContain("internal")
  })
  it("hides unassigned external sources and blocks calls before contacting ERP", async () => {
    expect(externalCatalog({ ...user, roles: [] })).toEqual([])
    await expect(
      readExternal({ ...user, roles: [] }, "bank-erp"),
    ).rejects.toMatchObject({ status: 403 })
    expect(fixture.list).not.toHaveBeenCalled()
  })
  it("does not present a declaration as an installed provider adapter", async () => {
    expect(
      externalCatalog(user).find((s) => s.id === "bank-provider")?.state,
    ).toBe("awaiting_provider_adapter")
    await expect(readExternal(user, "bank-provider")).rejects.toMatchObject({
      status: 409,
    })
  })
  it("rejects provider company/identity mismatches", async () => {
    externalAdapters["bank-provider"] = {
      type: "bank",
      roles: ["Accounts Manager"],
      validated: true,
      read: async () => ({
        company: "Other",
        source: "fixture",
        updatedAt: new Date().toISOString(),
        records: [],
      }),
    }
    try {
      await expect(readExternal(user, "bank-provider")).rejects.toMatchObject({
        status: 502,
      })
    } finally {
      delete externalAdapters["bank-provider"]
    }
  })
})
