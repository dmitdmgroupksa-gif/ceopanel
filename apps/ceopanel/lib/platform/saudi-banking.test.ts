import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import {
  maskSaudiIBAN,
  sarMinorUnits,
  saudiBankAdapter,
  saudiIBAN,
  transactionIdentity,
  type BankSnapshot,
} from "./saudi-banking"
import { redactRestrictedText } from "./privacy"
import { parseConfig } from "./config"
import type { UserContext } from "./policy"
const context: UserContext = {
  user: "finance@example.com",
  company: "Durar",
  roles: ["Accounts Manager"],
  currency: "SAR",
  companies: [],
  siteUrl: "https://example.frappe.cloud",
}
let snapshot: BankSnapshot
beforeEach(() => {
  snapshot = {
    company: "Durar",
    provider: "fixture",
    retrievedAt: new Date().toISOString(),
    asOf: new Date().toISOString(),
    authorization: {
      company: "Durar",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      permissions: ["accounts", "balances", "transactions"],
    },
    accounts: [
      {
        id: "account-1",
        iban: "SA0380000000608010167519",
        balanceType: "booked",
        balance: { currency: "SAR", amount: "100.10" },
      },
    ],
    transactions: [
      {
        id: "transaction-1",
        accountId: "account-1",
        date: "2026-10-15",
        status: "booked",
        direction: "debit",
        amount: { currency: "SAR", amount: "0.10" },
      },
    ],
    hasMore: false,
  }
})
function adapter() {
  return saudiBankAdapter({
    provider: "fixture",
    roles: ["Accounts Manager"],
    validated: true,
    read: async () => snapshot,
  })
}
describe("Saudi bank integration boundary", () => {
  it("validates electronic and printed Saudi IBANs without claiming account verification", () => {
    expect(saudiIBAN("sa03 8000 0000 6080 1016 7519")).toBe(
      snapshot.accounts[0].iban,
    )
    expect(() => saudiIBAN("SA0480000000608010167519")).toThrow("checksum")
    expect(() => saudiIBAN("GB0380000000608010167519")).toThrow("format")
    expect(maskSaudiIBAN(snapshot.accounts[0].iban)).not.toContain("60801016")
  })
  it("supports the registry's alphanumeric BBAN and redacts printed identifiers", () => {
    const bban = "80A00000006080167519"
    const numeric = (bban + "SA00").replace(/[A-Z]/g, (c) =>
      String(c.charCodeAt(0) - 55),
    )
    const iban = `SA${String(BigInt(98) - (BigInt(numeric) % BigInt(97))).padStart(2, "0")}${bban}`
    expect(saudiIBAN(iban)).toBe(iban)
    expect(redactRestrictedText(`Receipt ${iban} paid`)).not.toContain(iban)
    expect(
      redactRestrictedText("Receipt SA03 8000 0000 6080 1016 7519 paid"),
    ).not.toContain("7519")
  })
  it("preserves exact SAR precision without floating-point arithmetic", () => {
    expect(sarMinorUnits("0.10")).toBe("10")
    expect(sarMinorUnits("9007199254740991.99")).toBe("900719925474099199")
    expect(sarMinorUnits("-12.3")).toBe("-1230")
    for (const value of ["1.001", "1e3", "1,000.00", "NaN", "01.00"])
      expect(() => sarMinorUnits(value)).toThrow()
  })
  it("returns masked accounts, stable references, and explicit partial-data state", async () => {
    snapshot.hasMore = true
    const result = await adapter().read(context)
    expect(result.hasMore).toBe(true)
    expect(JSON.stringify(result)).not.toContain(snapshot.accounts[0].iban)
    expect(JSON.stringify(result)).not.toContain("account-1")
    expect(result.records[1]).toMatchObject({
      direction: "debit",
      amount: "0.10",
      currency: "SAR",
    })
    expect(transactionIdentity("A", "fixture", "1", "2")).not.toBe(
      transactionIdentity("B", "fixture", "1", "2"),
    )
  })
  it("rejects wrong company, expired grants, and unapproved access", async () => {
    await expect(
      adapter().read({ ...context, roles: [] }),
    ).rejects.toMatchObject({ status: 403 })
    snapshot.company = "Other"
    await expect(adapter().read(context)).rejects.toMatchObject({ status: 403 })
    snapshot.company = "Durar"
    snapshot.authorization.expiresAt = new Date(0).toISOString()
    await expect(adapter().read(context)).rejects.toMatchObject({ status: 401 })
    snapshot.authorization.expiresAt = new Date(
      Date.now() + 60000,
    ).toISOString()
    snapshot.authorization.permissions = ["accounts"]
    await expect(adapter().read(context)).rejects.toMatchObject({ status: 403 })
  })
  it("rejects duplicate transaction identities, cross-account rows, and invalid currency/amounts", async () => {
    const transaction = snapshot.transactions[0]
    snapshot.transactions.push({ ...transaction })
    await expect(adapter().read(context)).rejects.toThrow("duplicate")
    snapshot.transactions.pop()
    transaction.accountId = "different"
    await expect(adapter().read(context)).rejects.toThrow("account")
    transaction.accountId = "account-1"
    transaction.amount.currency = "USD"
    await expect(adapter().read(context)).rejects.toThrow("currency")
    transaction.amount.currency = "SAR"
    transaction.amount.amount = "1.001"
    await expect(adapter().read(context)).rejects.toMatchObject({ status: 502 })
  })
  it("keeps source declarations disabled and rejects incomplete activation", () => {
    const source = {
      id: "saudi-bank",
      title: "Saudi bank",
      type: "bank",
      country: "SA",
      connection: "provider",
    }
    expect(
      parseConfig({ externalSources: [source] }).externalSources[0]
        .readValidated,
    ).toBe(false)
    expect(() =>
      parseConfig({ externalSources: [{ ...source, readValidated: true }] }),
    ).toThrow("provider")
    expect(() =>
      parseConfig({
        externalSources: [
          { ...source, connection: "erpnext", modules: ["missing"] },
        ],
      }),
    ).toThrow("modules")
    expect(() => parseConfig({ externalSources: [source, source] })).toThrow(
      "Duplicate",
    )
  })
})
