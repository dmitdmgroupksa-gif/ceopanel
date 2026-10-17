import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import {
  externalReady,
  seal,
  unseal,
  pkceChallenge,
  redirectAllowed,
} from "./crypto"
import { trustedRequest, cors } from "./http"
import { delegatedSid, withDelegatedERP } from "./erp-identity"
import { connectBusinessTools } from "./client"
beforeEach(() => {
  vi.stubEnv("CEOPANEL_ORIGIN", "https://panel.example")
  vi.stubEnv("MCP_EXTERNAL_ENABLED", "true")
  vi.stubEnv("MCP_AUTH_SECRET", "ab".repeat(32))
})
afterEach(() => vi.unstubAllEnvs())
describe("MCP credential and origin boundaries", () => {
  it("preserves a structured service-unavailable error when the audit database is unconfigured", async () => {
    vi.stubEnv("DATABASE_URL", "")
    vi.stubEnv("PGHOST", "")
    const tools = await connectBusinessTools({
      context: {
        user: "fixture@example.com",
        company: "Fixture",
        roles: [],
        currency: "SAR",
        companies: [],
        siteUrl: "https://example.frappe.cloud",
      },
      principal: "human",
      evidence: [],
    })
    try {
      await expect(tools.call("notifications_list")).rejects.toMatchObject({
        status: 503,
      })
    } finally {
      await tools.close()
    }
  })
  it("accepts whitespace-separated configured client origins and preserves existing Vary headers", () => {
    vi.stubEnv(
      "MCP_CLIENT_ORIGINS",
      " https://client.example, https://second.example ",
    )
    const request = new Request("https://panel.example/api/mcp", {
      headers: { Origin: "https://second.example" },
    })
    expect(() => trustedRequest(request)).not.toThrow()
    const response = cors(
      request,
      new Response(null, { headers: { Vary: "Authorization" } }),
    )
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://second.example",
    )
    expect(response.headers.get("Vary")).toBe("Authorization, Origin")
  })
  it("encrypts credentials and binds tokens to purpose, audience and issuer", () => {
    const token = seal(
      "access",
      { sid: "private_erp_session", company: "Durar" },
      900,
    )
    expect(token).not.toContain("private_erp_session")
    expect(unseal("access", token).sid).toBe("private_erp_session")
    expect(() => unseal("refresh", token)).toThrow()
    expect(() => unseal("access", token.slice(0, -8) + "AAAAAAAA")).toThrow()
    vi.stubEnv("CEOPANEL_ORIGIN", "https://other.example")
    expect(() => unseal("access", token)).toThrow()
  })
  it("rejects expired tokens and invalid deployment configuration", () => {
    expect(() => unseal("access", seal("access", {}, -1))).toThrow()
    vi.stubEnv("MCP_AUTH_SECRET", "short")
    expect(externalReady).toThrow()
    vi.stubEnv("MCP_AUTH_SECRET", "ab".repeat(32))
    vi.stubEnv("CEOPANEL_ORIGIN", "https://panel.example/path")
    expect(externalReady).toThrow()
  })
  it("uses S256 and restricts redirect schemes", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    )
    expect(redirectAllowed("http://127.0.0.1:12345/callback")).toBe(true)
    for (const uri of [
      "http://evil.example/callback",
      "javascript:alert(1)",
      "https://user:pass@example.com",
      "https://example.com/#token",
    ])
      expect(redirectAllowed(uri)).toBe(false)
  })
  it("blocks DNS rebinding and cross-site consent", () => {
    expect(() =>
      trustedRequest(
        new Request("http://localhost:3000/api/mcp", {
          headers: { Host: "panel.example" },
        }),
      ),
    ).not.toThrow()
    expect(() =>
      trustedRequest(
        new Request("https://panel.example/api/mcp", {
          headers: {
            Host: "evil.example",
            "X-Forwarded-Host": "panel.example",
          },
        }),
      ),
    ).toThrow()
    expect(() =>
      trustedRequest(new Request("https://evil.example/api/mcp")),
    ).toThrow()
    expect(() =>
      trustedRequest(
        new Request("https://panel.example/api/mcp", {
          headers: { Origin: "https://evil.example" },
        }),
      ),
    ).toThrow()
    expect(() =>
      trustedRequest(new Request("https://panel.example/api/mcp"), true),
    ).toThrow()
    expect(() =>
      trustedRequest(
        new Request("https://panel.example/api/mcp", {
          headers: { Origin: "https://panel.example" },
        }),
        true,
      ),
    ).not.toThrow()
  })
  it("isolates delegated ERP sessions across concurrent requests", async () => {
    const results = await Promise.all(
      ["one", "two"].map((sid) =>
        withDelegatedERP(sid, async () => {
          await Promise.resolve()
          return delegatedSid()
        }),
      ),
    )
    expect(results).toEqual(["one", "two"])
    expect(delegatedSid()).toBeUndefined()
  })
})
