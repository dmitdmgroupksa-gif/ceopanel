import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { z } from "zod"
import { ERPNextError } from "../erpnext-error"
import { authenticationChallenge, toolFailure } from "./tool-response"
import { mcpError } from "./http"

afterEach(() => vi.unstubAllEnvs())
describe("MCP recovery responses", () => {
  it("gives bounded recovery guidance without exposing unexpected upstream errors", () => {
    const failure = toolFailure(
      new Error("private token and upstream traceback"),
      "erp_read_document",
    )
    expect(failure).toMatchObject({
      status: 502,
      code: "upstream_error",
      retryable: true,
    })
    expect(JSON.stringify(failure)).not.toContain("private")
    expect(failure.nextStep).toContain("Retry once")
    const invalid = toolFailure(
      z.object({ field: z.string() }).safeParse({}).error,
      "erp_run_report",
    )
    expect(invalid).toMatchObject({
      status: 400,
      code: "invalid_arguments",
      retryable: false,
    })
    expect(invalid.nextStep).toContain("exact required")
  })
  it("separates permission, session, stale source, large result and rate limit failures", () => {
    for (const [status, code, retryable] of [
      [401, "authentication_required", false],
      [403, "permission_denied", false],
      [404, "source_not_found", false],
      [409, "source_unavailable", false],
      [413, "result_too_large", false],
      [429, "rate_limited", true],
      [503, "service_unavailable", true],
      [504, "upstream_timeout", true],
    ] as const) {
      expect(
        toolFailure(
          new ERPNextError("Known safe error", status),
          "erp_read_document",
        ),
      ).toMatchObject({ status, code, retryable })
    }
  })
  it("advertises reauthentication and a real retry delay at the HTTP boundary", () => {
    vi.stubEnv("CEOPANEL_ORIGIN", "https://panel.example")
    vi.stubEnv("MCP_EXTERNAL_ENABLED", "true")
    vi.stubEnv("MCP_AUTH_SECRET", "ab".repeat(32))
    expect(authenticationChallenge()).toContain('error="invalid_token"')
    expect(
      mcpError(new ERPNextError("Sign in", 401)).headers.get(
        "WWW-Authenticate",
      ),
    ).toContain("/.well-known/oauth-protected-resource/api/mcp")
    expect(
      mcpError(new ERPNextError("Wait", 429)).headers.get("Retry-After"),
    ).toBe("60")
    expect(
      mcpError(new ERPNextError("Denied", 403)).headers.has("WWW-Authenticate"),
    ).toBe(false)
  })
})
