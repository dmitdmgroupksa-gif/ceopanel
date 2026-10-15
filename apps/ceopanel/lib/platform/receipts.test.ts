import { createHash, createHmac } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { verifiedReceipt, executionAuthorization } from "./receipts"
afterEach(() => vi.unstubAllEnvs())
describe("ERP execution proof", () => {
  it("signs a short-lived, action-bound execution authorization", () => {
    vi.stubEnv("ERPNEXT_RECEIPT_SECRET", "receipt-test-secret")
    const payload = JSON.stringify({
      kind: "create",
      module: "customers",
      values: { customer_name: "عميل" },
    })
    const authorization = executionAuthorization(
      "proposal-1",
      "درر",
      payload,
      "manager@example.com",
    )
    const signed = {
      actor: "manager@example.com",
      company: "درر",
      payloadHash: createHash("sha256").update(payload).digest("hex"),
      proposal: "proposal-1",
      timestamp: authorization.timestamp,
    }
    expect(authorization.signature).toBe(
      createHmac("sha256", "receipt-test-secret")
        .update("ceopanel.execute.v1:" + JSON.stringify(signed))
        .digest("hex"),
    )
    expect(Math.abs(authorization.timestamp - Date.now() / 1000)).toBeLessThan(
      2,
    )
  })
  it("binds proof to the approved payload and approving ERP identity", () => {
    vi.stubEnv("ERPNEXT_RECEIPT_SECRET", "receipt-test-secret")
    const payload = {
      kind: "create",
      module: "customers",
      values: { customer_name: "عميل" },
    }
    const receipt = {
      actor: "manager@example.com",
      company: "Durar",
      modified: "v2",
      module: "customers",
      name: "CUSTOMER-1",
      payloadHash: createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex"),
      proposal: "proposal-1",
    }
    const signature = createHmac("sha256", "receipt-test-secret")
      .update(JSON.stringify(receipt))
      .digest("hex")
    const check = (
      value = payload,
      approver = receipt.actor,
      proof = signature,
    ) =>
      verifiedReceipt(
        { receipt, signature: proof },
        receipt.proposal,
        receipt.company,
        receipt.module,
        receipt.name,
        value,
        approver,
      )
    expect(check().actor).toBe(receipt.actor)
    expect(() =>
      check({ ...payload, values: { customer_name: "Changed" } }),
    ).toThrow("verification")
    expect(() => check(payload, "other@example.com")).toThrow("verification")
    expect(() => check(payload, receipt.actor, signature + "garbage")).toThrow(
      "verification",
    )
  })
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
