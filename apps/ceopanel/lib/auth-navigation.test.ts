import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { isPortalPath, loginPath, safeReturnPath } from "./auth-navigation"
import { proxy } from "../proxy"

describe("safe login navigation", () => {
  it.each([
    "https://evil.example",
    "//evil.example/agents",
    "/\\evil.example",
    "/login?next=/agents",
    "/api/platform/proposals",
    "/%2f%2fevil.example",
    "/agents\n",
    "/agents/../login",
  ])("rejects untrusted return destination %s", (input) => {
    expect(safeReturnPath(input)).toBe("/")
  })
  it("preserves company filters, dashboard fragments, and explicit OAuth consent", () => {
    expect(safeReturnPath("/workspace?company=Company%20A#customers")).toBe(
      "/workspace?company=Company%20A#customers",
    )
    expect(safeReturnPath("/mcp/authorize?client_id=example&state=nonce")).toBe(
      "/mcp/authorize?client_id=example&state=nonce",
    )
    expect(loginPath("/#stock", true)).toBe("/login?next=%2F%23stock&expired=1")
    expect(isPortalPath("/api/platform/status")).toBe(false)
  })
  it("redirects anonymous portal requests and treats a cookie as optimistic only", () => {
    const anonymous = proxy(
      new NextRequest("https://panel.example/agents?view=history"),
    )
    expect(anonymous.status).toBe(307)
    expect(anonymous.headers.get("location")).toBe(
      "https://panel.example/login?next=%2Fagents%3Fview%3Dhistory",
    )
    expect(anonymous.headers.get("cache-control")).toContain("no-store")
    const signed = proxy(
      new NextRequest("https://panel.example/agents", {
        headers: { Cookie: "ceopanel_erpnext_sid=opaque-session" },
      }),
    )
    expect(signed.headers.get("x-middleware-next")).toBe("1")
    expect(
      proxy(
        new NextRequest("https://panel.example/agents", {
          headers: { Cookie: "ceopanel_erpnext_sid=Guest" },
        }),
      ).status,
    ).toBe(307)
  })
})
