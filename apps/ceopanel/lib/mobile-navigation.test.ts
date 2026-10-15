import { describe, expect, it } from "vitest"
import {
  navigationPolicy,
  portalOrigin,
} from "../../ceopanel-mobile/navigation"
describe("mobile portal boundaries", () => {
  it("requires a complete HTTPS origin without hidden credentials or paths", () => {
    expect(portalOrigin("https://ceo.example.com/")).toBe(
      "https://ceo.example.com",
    )
    for (const value of [
      "http://ceo.example.com",
      "https://user:pass@ceo.example.com",
      "https://ceo.example.com/agents",
      "https://ceo.example.com/?key=secret",
      "https://ceo.example.com/#path",
      "invalid",
    ])
      expect(portalOrigin(value)).toBe("")
  })
  it("allows portal navigation and opens only top-level HTTPS external links", () => {
    const origin = "https://ceo.example.com"
    expect(navigationPolicy(origin, `${origin}/knowledge`, true)).toBe("allow")
    expect(navigationPolicy(origin, "https://docs.example.com", true)).toBe(
      "external",
    )
    expect(navigationPolicy(origin, "https://docs.example.com", false)).toBe(
      "block",
    )
    for (const target of [
      "javascript:alert(1)",
      "http://external.example.com",
      "https://user:pass@ceo.example.com",
      "tel:+96655555",
    ])
      expect(navigationPolicy(origin, target, true)).toBe("block")
  })
})
