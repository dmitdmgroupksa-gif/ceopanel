import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const mocks = vi.hoisted(() => ({ context: vi.fn(), bridge: vi.fn() }))
vi.mock("../dashboard-server", () => ({ loadContext: mocks.context }))
vi.mock("../erpnext-server", () => ({
  client: async () => ({ roles: mocks.bridge }),
}))
import { identity } from "./auth"

describe("initial ERP administrator discovery", () => {
  it("loads native roles before any agent assignments exist", async () => {
    mocks.context.mockResolvedValue({
      user: "admin@example.com",
      company: "Company",
    })
    mocks.bridge.mockResolvedValue(["System Manager"])
    expect((await identity("Company")).roles).toEqual(["System Manager"])
    expect(mocks.bridge).toHaveBeenCalledWith()
  })
  it("rejects malformed native roles", async () => {
    mocks.context.mockResolvedValue({
      user: "admin@example.com",
      company: "Company",
      roles: [7],
    })
    await expect(identity()).rejects.toThrow(
      "ERP role configuration is invalid",
    )
  })
})
