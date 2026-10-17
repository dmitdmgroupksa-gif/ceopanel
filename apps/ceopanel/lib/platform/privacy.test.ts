import { describe, expect, it } from "vitest"
import { redactCredentials, redactRestrictedText } from "./privacy"
describe("native ERP prompt privacy", () => {
  it("allows an approved business-data request while removing credentials", () => {
    const request = "Show the bank account report and salary details."
    expect(redactCredentials(request)).toBe(request)
    expect(
      redactCredentials("API_KEY: private-value\nShow the bank account report"),
    ).toBe("[Credential removed]\nShow the bank account report")
    expect(redactCredentials("Use sk-abcdefghijklmno12345")).not.toContain(
      "sk-abcdefgh",
    )
    expect(redactRestrictedText(request)).toContain(
      "Restricted information removed",
    )
  })
})
