import { beforeEach, describe, expect, it, vi } from "vitest"
import { ERPNextError, type ERPNextClient } from "../erpnext-client"
vi.mock("server-only", () => ({}))
const mocks = vi.hoisted(() => ({
  allowed: true,
  sources: vi.fn(),
  describe: vi.fn(),
  search: vi.fn(),
  document: vi.fn(),
  approvals: vi.fn(),
  report: vi.fn(),
  runReport: vi.fn(),
}))
vi.mock("./read-policy", () => ({
  requireNativeRead: () => {
    if (!mocks.allowed) throw new ERPNextError("Access denied.", 403)
  },
}))
vi.mock("./reader", () => ({ erpReader: () => mocks }))
import { explore } from "./explorer"
const context = {
  user: "reader",
  company: "A",
  currency: "SAR",
  companies: [],
  siteUrl: "https://erp.example",
  roles: ["System Manager"],
}
const page = vi.fn()
const erp = { page } as unknown as ERPNextClient
beforeEach(() => {
  vi.clearAllMocks()
  mocks.allowed = true
  mocks.search.mockResolvedValue({
    records: [{ name: "DOC-1", company: "A" }],
    hasMore: false,
  })
  mocks.document.mockResolvedValue({ values: { name: "DOC-1" } })
})
describe("read-only human ERP explorer", () => {
  it.each(["create", "edit", "submit", "execute", "constructor"])(
    "rejects non-read action %s",
    async (action) => {
      await expect(explore(context, { action }, erp)).rejects.toMatchObject({
        status: 400,
      })
      expect(mocks.sources).not.toHaveBeenCalled()
      expect(page).not.toHaveBeenCalled()
    },
  )
  it("requires the existing broad ERP-read approval even without any AI model", async () => {
    mocks.allowed = false
    await expect(
      explore(context, { action: "schema", doctype: "Requests" }, erp),
    ).rejects.toMatchObject({ status: 403 })
    expect(mocks.describe).not.toHaveBeenCalled()
  })
  it("bounds discovery and rejects extra arguments", async () => {
    await explore(
      context,
      { action: "sources", query: "rent", kind: "report", offset: 20 },
      erp,
    )
    expect(mocks.sources).toHaveBeenCalledWith("rent", "report", 20, 20)
    await expect(
      explore(context, { action: "sources", limit: 500 }, erp),
    ).rejects.toMatchObject({ status: 400 })
  })
  it("validates record identities and the requested company scope", async () => {
    await explore(
      context,
      {
        action: "records",
        doctype: "Requests",
        fields: ["status"],
        filters: [["company", "=", "A"]],
      },
      erp,
    )
    expect(mocks.search).toHaveBeenLastCalledWith(
      "Requests",
      expect.objectContaining({ fields: ["status", "company"], limit: 20 }),
    )
    mocks.search.mockResolvedValueOnce({
      records: [{ name: "DOC-1", company: "B" }],
    })
    await expect(
      explore(
        context,
        {
          action: "records",
          doctype: "Requests",
          filters: [["company", "=", "A"]],
        },
        erp,
      ),
    ).rejects.toMatchObject({ status: 403 })
    mocks.search.mockResolvedValueOnce({
      records: [{ name: "DOC-1" }, { name: "DOC-1" }],
    })
    await expect(
      explore(context, { action: "records", doctype: "Requests" }, erp),
    ).rejects.toMatchObject({ status: 502 })
  })
  it("rechecks the parent before listing paginated file metadata, excluding paths", async () => {
    page.mockResolvedValue([
      {
        name: "FILE-1",
        file_name: "quote.pdf",
        file_size: 100,
        is_private: 1,
        file_url: "/private/files/hidden.pdf",
      },
    ])
    const result = await explore(
      context,
      { action: "attachments", doctype: "Quotation", name: "Q-1", offset: 20 },
      erp,
    )
    expect(mocks.document).toHaveBeenCalledWith("Quotation", "Q-1")
    expect(page).toHaveBeenCalledWith(
      "File",
      expect.objectContaining({
        offset: 20,
        limit: 21,
        filters: [
          ["attached_to_doctype", "=", "Quotation"],
          ["attached_to_name", "=", "Q-1"],
        ],
      }),
    )
    expect(result).toEqual({
      files: [
        { name: "FILE-1", filename: "quote.pdf", size: 100, private: true },
      ],
      hasMore: false,
    })
    mocks.document.mockRejectedValueOnce(new ERPNextError("Denied", 403))
    page.mockClear()
    await expect(
      explore(
        context,
        { action: "attachments", doctype: "Quotation", name: "Q-1" },
        erp,
      ),
    ).rejects.toMatchObject({ status: 403 })
    expect(page).not.toHaveBeenCalled()
  })
  it("delegates workflow inspection without exposing any execution operation", async () => {
    await explore(
      context,
      { action: "workflow", doctype: "Request", name: "R-1" },
      erp,
    )
    expect(mocks.approvals).toHaveBeenCalledWith("Request", "R-1")
  })
})
