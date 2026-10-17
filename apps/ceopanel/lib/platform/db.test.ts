import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  connect: vi.fn(),
  on: vi.fn(),
}))
vi.mock("pg", () => ({
  Pool: class {
    connect = mocks.connect
    on = mocks.on
  },
}))
import { database, transaction } from "./db"
afterEach(() => vi.unstubAllEnvs())
beforeEach(() => {
  mocks.query.mockReset().mockResolvedValue({})
  mocks.release.mockReset()
  mocks.connect.mockResolvedValue({
    query: mocks.query,
    release: mocks.release,
  })
  vi.stubEnv("DATABASE_URL", "postgresql://fixture-only")
})
describe("database recovery", () => {
  it("handles idle connection errors without exposing connection details", () => {
    database()
    expect(mocks.on).toHaveBeenCalledWith("error", expect.any(Function))
  })
  it("preserves the original operation failure and evicts a connection when rollback fails", async () => {
    const primary = new Error("operation failed"),
      disconnected = new Error("disconnected")
    mocks.query.mockImplementation(async (sql) => {
      if (sql === "ROLLBACK") throw disconnected
      return {}
    })
    await expect(
      transaction(async () => {
        throw primary
      }),
    ).rejects.toBe(primary)
    expect(mocks.release).toHaveBeenCalledWith(disconnected)
  })
  it("rolls back and reuses a healthy connection after a rejected operation", async () => {
    const primary = new Error("invalid operation")
    await expect(
      transaction(async () => {
        throw primary
      }),
    ).rejects.toBe(primary)
    expect(mocks.query).toHaveBeenCalledWith("ROLLBACK")
    expect(mocks.release).toHaveBeenCalledWith(undefined)
  })
})
