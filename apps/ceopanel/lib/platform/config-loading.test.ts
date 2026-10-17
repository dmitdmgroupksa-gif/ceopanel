import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const read = vi.hoisted(() => vi.fn())
vi.mock("node:fs", () => ({ readFileSync: read }))
beforeEach(() => {
  vi.resetModules()
  read.mockReset()
})
afterEach(() => vi.unstubAllEnvs())
describe("startup platform configuration", () => {
  it("parses a configuration once so repeated requests share the startup mapping snapshot", async () => {
    vi.stubEnv("PLATFORM_CONFIG_PATH", "fixture.json")
    read.mockReturnValue('{"environment":"staging"}')
    const { platformConfig } = await import("./config")
    const first = platformConfig()
    read.mockReturnValue('{"environment":"production"}')
    expect(platformConfig()).toBe(first)
    expect(read).toHaveBeenCalledTimes(1)
  })
  it("does not fall back to a previously enabled configuration when a new path is invalid", async () => {
    vi.stubEnv("PLATFORM_CONFIG_PATH", "first.json")
    read.mockReturnValue("{}")
    const { platformConfig } = await import("./config")
    platformConfig()
    vi.stubEnv("PLATFORM_CONFIG_PATH", "invalid.json")
    read.mockReturnValue("invalid")
    expect(() => platformConfig()).toThrow()
  })
})
