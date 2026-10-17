import { describe, expect, it } from "vitest"
import { parseConfig } from "./config"
import { draftFromDiscovery } from "./discovery"

const config = () =>
  parseConfig({
    environment: "production",
    aiDataApproved: true,
    modules: [
      {
        id: "orders",
        title: "Orders",
        doctype: "Sales Order",
        custom: true,
        fields: [],
        readValidated: true,
        writeValidated: true,
      },
    ],
    channels: { email: true, voice: true, whatsapp: true },
  })
describe("ERP discovery draft import", () => {
  it("imports native fields and child schemas, omits unsafe/unsupported types and disables activation", () => {
    const source = {
      discovery: {
        schemas: {
          orders: {
            doctype: "Sales Order",
            fields: [
              { name: "customer", label: "Customer", type: "Link" },
              {
                name: "status",
                type: "Select",
                options: "\nDraft\nApproved\n",
              },
              {
                name: "items",
                type: "Table",
                fields: [{ name: "qty", type: "Float", required: 1 }],
              },
              { name: "secret", type: "Password" },
              { name: "attachment", type: "Attach" },
              { name: "scan", type: "Table" },
            ],
          },
        },
      },
    }
    const result = draftFromDiscovery(config(), source)
    expect(result.draft.environment).toBe("staging")
    expect(result.draft.aiDataApproved).toBe(false)
    expect(result.draft.channels).toEqual({
      email: false,
      voice: false,
      whatsapp: false,
    })
    expect(result.draft.modules[0]).toMatchObject({
      readValidated: false,
      writeValidated: false,
      fieldInput: false,
      aiFields: [],
    })
    expect(result.draft.modules[0].fields.map((f) => f.name)).toEqual([
      "customer",
      "status",
      "items",
    ])
    expect(result.draft.modules[0].fields[1].options).toEqual([
      "Draft",
      "Approved",
    ])
    expect(result.draft.modules[0].fields[2].fields?.[0]).toMatchObject({
      name: "qty",
      type: "number",
      required: true,
    })
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Password"),
        expect.stringContaining("company scope"),
      ]),
    )
    expect(source.discovery.schemas.orders.fields).toHaveLength(6)
  })
  it("clears stale fields for absent or mismatched DocTypes and rejects malformed discovery", () => {
    for (const schema of [
      { doctype: "Different", fields: [] },
      { doctype: "Sales Order", state: "missing_doctype", fields: [] },
    ]) {
      const result = draftFromDiscovery(config(), {
        schemas: { orders: schema },
      })
      expect(result.draft.modules[0].fields).toEqual([])
      expect(result.warnings[0]).toContain("unavailable")
    }
    expect(() =>
      draftFromDiscovery(config(), {
        schemas: { orders: { doctype: "Sales Order", fields: "bad" } },
      }),
    ).toThrow()
  })
})
