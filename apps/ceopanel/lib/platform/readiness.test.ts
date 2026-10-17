import { describe, expect, it } from "vitest"
import { parseConfig } from "./config"
import { configurationReadiness } from "./readiness"

describe("rollout configuration diagnostics", () => {
  it("reports missing prerequisites, keeps optional channels disabled and never claims live validation", () => {
    const report = configurationReadiness(parseConfig({}), {})
    expect(report.configured).toBe(false)
    expect(report.liveAcceptanceRequired).toBe(true)
    expect(report.verification).toBe("configuration_inventory_only")
    expect(
      report.checks
        .filter((c) => c.phase === "foundation")
        .every((c) => c.state === "blocked"),
    ).toBe(true)
    expect(report.checks.find((c) => c.id === "mcp")?.state).toBe("disabled")
  })
  it("rejects placeholders and malformed connections without returning sensitive environment values", () => {
    const report = configurationReadiness(parseConfig({}), {
      ERPNEXT_URL: "https://staging.invalid",
      DATABASE_URL: "https://private-password@db.example/private-company",
      REDIS_URL: "invalid-private-secret",
      ERPNEXT_RECEIPT_SECRET: "short-private-secret",
    })
    for (const id of ["erp", "database", "redis", "receipts"])
      expect(report.checks.find((c) => c.id === id)?.state).toBe("blocked")
    expect(JSON.stringify(report)).not.toMatch(
      /private-password|db\.example|private-company|invalid-private-secret|short-private-secret/,
    )
  })
  it("keeps AI optional until model configuration or agent assignments are supplied", () => {
    const disabled = configurationReadiness(parseConfig({}), {})
    for (const id of ["agents", "ai"])
      expect(disabled.checks.find((c) => c.id === id)?.state).toBe("disabled")
    const enabled = configurationReadiness(parseConfig({}), {
      OPENAI_MODEL: "approved-model",
    })
    for (const id of ["agents", "ai"])
      expect(enabled.checks.find((c) => c.id === id)?.state).toBe("blocked")
  })
  it("requires approved scalar AI fields as well as roles and enabled sources", () => {
    const module = {
      id: "customers",
      title: "Customers",
      doctype: "Customer",
      fields: [{ name: "customer_name", label: "Customer", type: "text" }],
      readValidated: true,
    }
    const input = {
      modules: [module],
      agents: { sales: { roles: ["Sales User"], modules: ["customers"] } },
    }
    expect(
      configurationReadiness(parseConfig(input), {}).checks.find(
        (c) => c.id === "agents",
      )?.state,
    ).toBe("blocked")
    expect(
      configurationReadiness(
        parseConfig({
          ...input,
          modules: [{ ...module, aiFields: ["customer_name"] }],
        }),
        {},
      ).checks.find((c) => c.id === "agents")?.state,
    ).toBe("pass")
  })
  it("requires an approver for each enabled write module and checks activated remote channels", () => {
    const config = parseConfig({
      modules: [
        {
          id: "customers",
          title: "Customers",
          doctype: "Customer",
          fields: [],
          readValidated: true,
          writeValidated: true,
        },
      ],
      channels: { whatsapp: true },
    })
    const report = configurationReadiness(config, {
      CEOPANEL_ORIGIN: "http://localhost:3000",
      MCP_EXTERNAL_ENABLED: "true",
      MCP_AUTH_SECRET: "not-hex",
    })
    for (const id of ["approvers", "public-origin", "mcp", "whatsapp"])
      expect(report.checks.find((c) => c.id === id)?.state).toBe("blocked")
  })
})
