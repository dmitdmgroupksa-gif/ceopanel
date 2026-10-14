import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const config = vi.hoisted(() => ({
  agents: {
    sales: {
      roles: ["Sales User"],
      modules: ["customers"],
      approvers: ["manager@example.com"],
    },
  },
  modules: [
    { id: "customers", readValidated: true, aiFields: ["customer_name"] },
  ],
  collections: [
    {
      id: "policies",
      approvedForAI: true,
      roles: ["Sales User"],
      uploadRoles: ["Sales Manager"],
    },
  ],
}))
vi.mock("./config", () => ({ platformConfig: () => config }))
import {
  agentAccess,
  moduleAccess,
  collectionAccess,
  type UserContext,
} from "./policy"
const context: UserContext = {
  user: "sales@example.com",
  company: "Durar",
  currency: "SAR",
  companies: [],
  siteUrl: "https://example.frappe.cloud",
  roles: ["Sales User"],
}
describe("department and knowledge permissions", () => {
  it("denies unknown agents, unassigned departments and unassigned tools", () => {
    expect(agentAccess(context, "sales").agent.id).toBe("sales")
    expect(() => agentAccess(context, "finance")).toThrow("not available")
    expect(() =>
      agentAccess({ ...context, roles: ["HR User"] }, "sales"),
    ).toThrow("not available")
    expect(() => moduleAccess(context, "sales", "payroll")).toThrow(
      "not assigned",
    )
    expect(moduleAccess(context, "sales", "customers").id).toBe("customers")
  })
  it("rechecks current collection roles and separates upload access", () => {
    expect(collectionAccess(context, "policies").id).toBe("policies")
    expect(() =>
      collectionAccess({ ...context, roles: [] }, "policies"),
    ).toThrow("not available")
    expect(() => collectionAccess(context, "policies", true)).toThrow(
      "not available",
    )
    expect(
      collectionAccess(
        { ...context, roles: ["Sales Manager"] },
        "policies",
        true,
      ).id,
    ).toBe("policies")
  })
})
