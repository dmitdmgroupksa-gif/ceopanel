import { afterEach, describe, expect, it, vi } from "vitest"
import { redisConnection } from "./queue"
afterEach(() => vi.unstubAllEnvs())
describe("Redis connection validation", () => {
  it.each([
    "https://example.com/private-password",
    "redis://localhost/not-a-database",
    "redis://localhost/-1",
    "redis://localhost/9007199254740992",
  ])("rejects invalid configuration without echoing its value", (value) => {
    vi.stubEnv("REDIS_URL", value)
    expect(() => redisConnection()).toThrow(/Redis.*(configuration|index)/)
  })
  it("supports TLS, encoded credentials and IPv6", () => {
    vi.stubEnv("REDIS_URL", "rediss://user:p%40ss@[::1]:6380/2")
    expect(redisConnection()).toEqual({
      host: "::1",
      port: 6380,
      username: "user",
      password: "p@ss",
      db: 2,
      tls: {},
    })
  })
})
