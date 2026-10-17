import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("../platform/config", () => ({ aiDataApproved: () => true }))
import { mcpConnectionSettings } from "./settings"
import { nativeReadAccess } from "../erp-native/read-policy"

const user = { user: "employee@example.com", company: "A", currency: "SAR", companies: [], siteUrl: "https://erp.example", roles: ["Desk User", "Employee"] }
function configure() {
  vi.stubEnv("CEOPANEL_ORIGIN", "https://panel.example")
  vi.stubEnv("MCP_EXTERNAL_ENABLED", "true")
  vi.stubEnv("MCP_AUTH_SECRET", "ab".repeat(32))
  vi.stubEnv("DATABASE_URL", "postgresql://fixture-only")
  vi.stubEnv("ERP_AI_READ_ENABLED", "true")
  vi.stubEnv("ERP_AI_READ_ROLES", "")
}
afterEach(() => vi.unstubAllEnvs())
describe("personal MCP setup", () => {
  it("lets internal employees connect with their identity and read scopes", () => {
    configure()
    expect(nativeReadAccess(user)).toBe(true)
    const settings = mcpConnectionSettings(user)
    expect(settings).toMatchObject({ user: user.user, company: "A", endpoint: "https://panel.example/api/mcp", ready: true, erpRead: true, scopes: ["ceopanel:read", "ceopanel:erp-read"] })
    expect(JSON.stringify(settings)).not.toContain(process.env.MCP_AUTH_SECRET)
    expect(JSON.stringify(settings)).not.toContain(process.env.DATABASE_URL)
  })
  it("does not grant the employee role access to guests or website-only users", () => {
    configure()
    expect(nativeReadAccess({ roles: ["All", "Guest"] })).toBe(false)
    expect(nativeReadAccess({ roles: ["All", "Customer"] })).toBe(false)
  })
  it("preserves an explicitly restricted role allowlist", () => {
    configure()
    vi.stubEnv("ERP_AI_READ_ROLES", "Approved ERP Reader")
    expect(mcpConnectionSettings(user)).toMatchObject({ ready: false, erpRead: false })
  })
  it("explains missing configuration without inventing a ready connection", () => {
    configure()
    vi.stubEnv("MCP_EXTERNAL_ENABLED", "false")
    expect(mcpConnectionSettings(user)).toMatchObject({ ready: false, endpoint: "https://panel.example/api/mcp" })
    vi.stubEnv("CEOPANEL_ORIGIN", "")
    expect(mcpConnectionSettings(user)).toMatchObject({ ready: false, endpoint: null })
  })
})
