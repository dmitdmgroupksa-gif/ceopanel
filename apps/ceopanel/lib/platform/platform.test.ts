import { createHmac } from "node:crypto"
import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { agents } from "./catalog"
import { parseConfig } from "./config"
import { validSignature, eventId } from "./events"
import { redactRestrictedText } from "./privacy"
import { validateValues } from "../workspace"
import { validMetaSignature } from "./channels"

describe("platform activation boundaries", () => {
  it("ships all eight departments and keeps integrations inactive by default", () => {
    expect(agents.map((a) => a.id)).toEqual([
      "sales",
      "finance",
      "inventory",
      "procurement",
      "logistics",
      "hr",
      "facilities",
      "executive",
    ])
    expect(parseConfig({})).toMatchObject({
      environment: "staging",
      aiDataApproved: false,
      modules: [],
      channels: { email: false, whatsapp: false, voice: false },
    })
  })
  it("rejects enabling writes before source validation and restricted AI fields", () => {
    const module = {
      id: "customers",
      title: "Customers",
      doctype: "Customer",
      fields: [{ name: "customer_name", label: "Customer", type: "text" }],
    }
    expect(() =>
      parseConfig({ modules: [{ ...module, writeValidated: true }] }),
    ).toThrow("Validate reads")
    expect(() =>
      parseConfig({ modules: [{ ...module, aiFields: ["bank_account"] }] }),
    ).toThrow("AI fields")
    expect(() =>
      parseConfig({ modules: [{ ...module, aiFields: ["unknown_field"] }] }),
    ).toThrow("AI fields")
    expect(() => parseConfig({ modules: [module, module] })).toThrow(
      "Duplicate",
    )
  })
  it("rejects duplicate and mistyped integration references before activation", () => {
    expect(() =>
      parseConfig({
        agents: { sales: { roles: ["Sales User"], modules: ["typo"] } },
      }),
    ).toThrow("source references")
    expect(() => parseConfig({ agents: { typo: { roles: [] } } })).toThrow(
      "Unknown agent",
    )
    const collection = {
      id: "policies",
      title: "Policies",
      roles: ["Reader"],
      uploadRoles: ["Reader"],
    }
    expect(() =>
      parseConfig({ collections: [collection, collection] }),
    ).toThrow("Duplicate collection")
    expect(() =>
      parseConfig({
        collections: [{ ...collection, uploadRoles: ["Uploader"] }],
      }),
    ).toThrow("read access")
  })
})
describe("signed event intake", () => {
  it("verifies exact payloads and denies missing, tampered and malformed signatures", () => {
    const body =
        '{"doctype":"Sales Invoice","name":"INV-1","modified":"2026-10-14"}',
      secret = "test-secret"
    const signature = createHmac("sha256", secret).update(body).digest("base64")
    expect(validSignature(body, signature, secret)).toBe(true)
    expect(validSignature(body + " ", signature, secret)).toBe(false)
    expect(validSignature(body, null, secret)).toBe(false)
    expect(validSignature(body, signature, undefined)).toBe(false)
    expect(validSignature(body, "invalid", secret)).toBe(false)
    expect(validSignature(body, signature + "garbage", secret)).toBe(false)
    expect(eventId(body)).toBe(eventId(body))
    expect(eventId(body + " ")).not.toBe(eventId(body))
  })
  it("rejects malformed WhatsApp signatures even when they start with a valid digest", () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "secret")
    try {
      const body = "{}",
        signature =
          "sha256=" + createHmac("sha256", "secret").update(body).digest("hex")
      expect(validMetaSignature(body, signature)).toBe(true)
      expect(validMetaSignature(body, signature + "garbage")).toBe(false)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
describe("approved input protection", () => {
  it("redacts credentials and bank identifiers while preserving useful document content", () => {
    const value = redactRestrictedText(
      "Company policy\nAPI_KEY: abc-def\nIBAN: SA1234567890123456789012\nLeave requires manager review\nsk-exampleSecretCredential12345",
    )
    expect(value).not.toContain("abc-def")
    expect(value).not.toContain("SA123")
    expect(value).not.toContain("sk-example")
    expect(value).toContain("Leave requires manager review")
  })
  it("preserves validated child row identity and rejects identity injection", () => {
    const fields = [
      {
        name: "items",
        label: "Items",
        type: "table" as const,
        fields: [{ name: "item_code", label: "Item", type: "link" as const }],
      },
    ]
    expect(
      validateValues(
        { items: [{ _row_id: "ROW-1", item_code: "ITEM-1" }] },
        fields,
      ),
    ).toEqual({ items: [{ _row_id: "ROW-1", item_code: "ITEM-1" }] })
    expect(() =>
      validateValues(
        { items: [{ _row_id: { name: "other" }, item_code: "ITEM-1" }] },
        fields,
      ),
    ).toThrow("identity")
    expect(() =>
      validateValues(
        { items: [{ _row_id: "ROW-1", ignore_permissions: true }] },
        fields,
      ),
    ).toThrow("cannot")
  })
})
