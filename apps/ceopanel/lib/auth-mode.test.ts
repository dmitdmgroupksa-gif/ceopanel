import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { localAuthDisabled } from "./auth-mode"
import { proxy } from "../proxy"

afterEach(() => vi.unstubAllEnvs())

describe("local authentication switch", () => {
  it.each(["localhost", "localhost:3001", "127.0.0.1:3001", "[::1]:3001"])(
    "allows an explicitly enabled development preview on %s",
    (host) => {
      vi.stubEnv("NODE_ENV", "development")
      vi.stubEnv("CEOPANEL_DISABLE_AUTH", "true")
      expect(localAuthDisabled(host)).toBe(true)
      expect(
        proxy(new NextRequest(`http://${host}/agents`)).headers.get(
          "x-middleware-next",
        ),
      ).toBe("1")
    },
  )
  it.each(["production", "test"])(
    "keeps authentication required in %s even when the switch is set",
    (mode) => {
      vi.stubEnv("NODE_ENV", mode)
      vi.stubEnv("CEOPANEL_DISABLE_AUTH", "true")
      expect(localAuthDisabled("localhost:3001")).toBe(false)
      expect(
        proxy(new NextRequest("http://localhost:3001/agents")).status,
      ).toBe(307)
    },
  )
  it.each(["false", "", "1", "TRUE"])(
    "requires the explicit value true, not %s",
    (value) => {
      vi.stubEnv("NODE_ENV", "development")
      vi.stubEnv("CEOPANEL_DISABLE_AUTH", value)
      expect(localAuthDisabled("localhost:3001")).toBe(false)
    },
  )
  it.each([
    "panel.example",
    "localhost.evil.example",
    "127.0.0.1.evil.example",
    "192.168.1.10:3001",
    "user@localhost",
    "localhost/path",
    "",
  ])("rejects non-loopback or malformed request hosts: %s", (host) => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("CEOPANEL_DISABLE_AUTH", "true")
    expect(localAuthDisabled(host)).toBe(false)
  })
  it("does not accept a query parameter or cookie as an auth switch", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("CEOPANEL_DISABLE_AUTH", "false")
    expect(
      proxy(
        new NextRequest(
          "http://localhost:3001/agents?CEOPANEL_DISABLE_AUTH=true",
          { headers: { Cookie: "CEOPANEL_DISABLE_AUTH=true" } },
        ),
      ).status,
    ).toBe(307)
  })
})
