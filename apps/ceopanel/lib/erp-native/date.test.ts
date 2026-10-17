import { describe, it, expect } from "vitest"
import { erpDate } from "./date"

describe("ERP calendar dates", () => {
  it.each([null, undefined, ""])(
    "keeps missing dates unavailable: %s",
    (value) => expect(erpDate(value)).toBeNull(),
  )
  it.each([
    "2024-02-29",
    "2026-10-17 23:59:59.123456",
    "2026-10-17T00:30:00+03:00",
    "2026-10-17T23:30Z",
  ])("preserves the ERP's own calendar day: %s", (value) =>
    expect(erpDate(value)).toBe(value.slice(0, 10)),
  )
  it.each([
    "2026-02-29",
    "2026-02-30",
    "2026-04-31",
    "2026-13-01",
    "2026-10-17 99:01:00",
    "2026-10-17 01:60:00",
    "2026-10-17 01:00:60",
    "2026-10-17 01:00junk",
    "2026-10-17junk",
    "2026-10-17T00:00:00+99:00",
    123,
  ])("rejects invalid dates and complete malformed timestamps: %s", (value) =>
    expect(() => erpDate(value)).toThrow("date is invalid"),
  )
})
