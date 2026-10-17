import { beforeEach, describe, expect, it, vi } from "vitest"
import { ERPNextError } from "../erpnext-client"
vi.mock("server-only", () => ({}))
const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  explore: vi.fn(),
  brief: vi.fn(),
  client: vi.fn(),
  origin: true,
}))
vi.mock("../platform/auth", () => ({ identity: mocks.identity }))
vi.mock("../erpnext-server", () => ({
  client: mocks.client,
  validOrigin: () => mocks.origin,
}))
vi.mock("./explorer", () => ({ explore: mocks.explore }))
vi.mock("./brief", () => ({ dailyBrief: mocks.brief }))
import { POST } from "../../app/api/erp/explorer/route"
import { GET } from "../../app/api/erp/brief/route"
const context = { user: "reader", company: "A", roles: ["System Manager"] }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.origin = true
  mocks.identity.mockResolvedValue(context)
  mocks.explore.mockResolvedValue({ results: [] })
  mocks.brief.mockResolvedValue({ cards: [] })
})
function request(body: unknown) {
  return new Request("https://portal.example/api/erp/explorer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}
describe("native explorer HTTP boundaries", () => {
  it("authenticates the chosen company and returns private no-store data", async () => {
    const response = await POST(
      request({ company: "A", action: "sources", query: "rent" }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(response.headers.get("Vary")).toBe("Cookie")
    expect(mocks.identity).toHaveBeenCalledWith("A")
    expect(mocks.explore).toHaveBeenCalledWith(
      context,
      { action: "sources", query: "rent" },
      undefined,
    )
  })
  it("rejects a foreign origin before any company data access", async () => {
    mocks.origin = false
    expect((await POST(request({ action: "sources" }))).status).toBe(403)
    expect(mocks.identity).not.toHaveBeenCalled()
    expect(mocks.explore).not.toHaveBeenCalled()
  })
  it.each([null, [], "invalid", { company: 42, action: "sources" }])(
    "rejects malformed request data",
    async (body) => {
      expect((await POST(request(body))).status).toBe(400)
      expect(mocks.explore).not.toHaveBeenCalled()
    },
  )
  it("returns 401 instead of a token-based or preview fallback", async () => {
    mocks.identity.mockRejectedValueOnce(
      new ERPNextError("Please sign in.", 401),
    )
    expect((await POST(request({ action: "sources" }))).status).toBe(401)
    expect(mocks.client).not.toHaveBeenCalled()
    expect(mocks.explore).not.toHaveBeenCalled()
  })
  it("requires company verification for the briefing without requiring an AI model", async () => {
    const response = await GET(
      new Request("https://portal.example/api/erp/brief?company=A"),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(mocks.identity).toHaveBeenCalledWith("A")
    expect(mocks.brief).toHaveBeenCalledWith(context)
  })
})
