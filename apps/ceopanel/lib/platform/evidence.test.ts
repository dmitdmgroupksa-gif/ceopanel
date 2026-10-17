import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  attachments: vi.fn(),
  client: vi.fn(),
  access: vi.fn(() => true),
}))
vi.mock("../erpnext-server", () => ({ client: mocks.client }))
vi.mock("../erp-native/reader", () => ({
  erpReader: () => ({ search: mocks.search, attachments: mocks.attachments }),
}))
vi.mock("../erp-native/files", () => ({ erpExport: vi.fn() }))
vi.mock("../erp-native/read-policy", () => ({ nativeReadAccess: mocks.access }))
vi.mock("./config", () => ({
  platformConfig: () => ({ modules: [], reports: [] }),
}))
vi.mock("./policy", () => ({
  agentAccess: () => ({ mapping: { modules: [], reports: [] } }),
}))
vi.mock("./db", () => ({
  database: vi.fn(() => {
    throw Error("No database needed for native references")
  }),
}))
import { permittedEvidence } from "./evidence"
const context = {
  user: "reader",
  company: "A",
  currency: "SAR",
  companies: [],
  siteUrl: "https://erp.example",
  roles: ["Employee"],
}
const content = { records: [{ name: "REQ-1" }], scope: "Native permissions" }
const evidence = {
  kind: "native-erp",
  type: "records",
  source: "Requests",
  query: { limit: 20 },
  digest: createHash("sha256").update(JSON.stringify(content)).digest("hex"),
}
beforeEach(() => {
  mocks.search
    .mockReset()
    .mockResolvedValue({ ...content, provenance: { retrievedAt: "now" } })
  mocks.client.mockReset().mockResolvedValue({})
  mocks.attachments.mockReset()
  mocks.access.mockReturnValue(true)
})
describe("history evidence revalidation", () => {
  it("rechecks attachment pages and hides previous answers when attachments change", async () => {
    const content = {
      files: [{ name: "F-1", file_name: "quote.pdf" }],
      offset: 20,
      limit: 20,
    }
    mocks.attachments.mockResolvedValue({ ...content, provenance: {} })
    const items = [
      {
        id: "attachments",
        agent: "sales",
        evidence: [
          {
            kind: "native-erp",
            type: "attachments",
            source: "Quotation",
            names: ["Q-1"],
            query: { offset: 20, limit: 20 },
            digest: createHash("sha256")
              .update(JSON.stringify(content))
              .digest("hex"),
          },
        ],
      },
    ]
    expect(await permittedEvidence(context, items)).toHaveLength(1)
    expect(mocks.attachments).toHaveBeenCalledWith("Quotation", "Q-1", 20, 20)
    mocks.attachments.mockResolvedValue({
      ...content,
      files: [],
      provenance: {},
    })
    expect(await permittedEvidence(context, items)).toEqual([])
  })
  it("checks identical sources once per request while comparing each answer's own digest", async () => {
    const items = [
      { id: "1", agent: "sales", evidence: [evidence] },
      {
        id: "2",
        agent: "sales",
        evidence: [{ ...evidence, digest: "changed" }],
      },
      {
        id: "3",
        agent: "sales",
        evidence: [{ ...evidence, retrievedAt: "earlier" }],
      },
    ]
    expect((await permittedEvidence(context, items)).map((r) => r.id)).toEqual([
      "1",
      "3",
    ])
    expect(mocks.search).toHaveBeenCalledTimes(1)
    expect(mocks.client).toHaveBeenCalledTimes(1)
    await permittedEvidence(context, items)
    expect(mocks.search).toHaveBeenCalledTimes(2)
  })
  it("separates different queries and hides all affected answers after a permission failure", async () => {
    mocks.search.mockRejectedValue(Error("Permission revoked"))
    const items = [
      { id: "1", agent: "sales", evidence: [evidence] },
      { id: "2", agent: "sales", evidence: [evidence] },
      {
        id: "3",
        agent: "sales",
        evidence: [{ ...evidence, query: { limit: 10 } }],
      },
    ]
    expect(await permittedEvidence(context, items)).toEqual([])
    expect(mocks.search).toHaveBeenCalledTimes(2)
  })
  it("rechecks current role access before consulting a source", async () => {
    mocks.access.mockReturnValue(false)
    expect(
      await permittedEvidence(context, [
        { id: "1", agent: "sales", evidence: [evidence] },
      ]),
    ).toEqual([])
    expect(mocks.search).not.toHaveBeenCalled()
  })
})
