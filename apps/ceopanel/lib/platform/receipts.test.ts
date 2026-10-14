import { createHmac } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { verifiedReceipt } from "./receipts"
afterEach(() => vi.unstubAllEnvs())
describe("ERP execution proof", () => {
  it("requires a matching signed receipt and rejects spoofed or cross-company proof", () => {
    vi.stubEnv("ERPNEXT_RECEIPT_SECRET", "receipt-test-secret")
    const receipt = {
      company: "Durar",
      modified: "v2",
      module: "customers",
      name: "CUSTOMER-1",
      proposal: "proposal-1",
    }
    const signature = createHmac("sha256", "receipt-test-secret")
      .update(JSON.stringify(receipt))
      .digest("hex")
    expect(
      verifiedReceipt(
        { receipt, signature },
        "proposal-1",
        "Durar",
        "customers",
      ).name,
    ).toBe("CUSTOMER-1")
    expect(() =>
      verifiedReceipt(
        { receipt, signature: "f".repeat(64) },
        "proposal-1",
        "Durar",
        "customers",
      ),
    ).toThrow("verification")
    expect(() =>
      verifiedReceipt(
        { receipt, signature },
        "proposal-1",
        "Other",
        "customers",
      ),
    ).toThrow("verification")
    expect(() =>
      verifiedReceipt(
        { receipt, signature },
        "proposal-1",
        "Durar",
        "customers",
        "OTHER-RECORD",
      ),
    ).toThrow("verification")
    expect(() =>
      verifiedReceipt(
        { receipt: { ...receipt, name: "ALTERED" }, signature },
        "proposal-1",
        "Durar",
        "customers",
      ),
    ).toThrow("verification")
  })
})
