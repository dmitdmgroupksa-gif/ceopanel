import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("./auth", () => ({
  identity: async () => ({
    user: "ceo@example.com",
    company: "Durar",
    roles: ["CEO"],
  }),
  agentAccess: vi.fn(),
}))
vi.mock("../mcp/client", async () => {
  const { ERPNextError } = await import("../erpnext-client")
  return {
    humanTool: async (_company: string, name: string) => {
      throw new ERPNextError(
        name === "attachment_read"
          ? "Attachment access denied."
          : "Conversation not found.",
        name === "attachment_read" ? 403 : 404,
      )
    },
  }
})
vi.mock("../erpnext-server", () => ({
  validOrigin: () => true,
  client: vi.fn(),
}))
import { GET, POST } from "../../app/api/platform/[...path]/route"
describe("platform download error responses", () => {
  it("returns a structured permission response when a private attachment rejects asynchronously", async () => {
    const response = await GET(
      new Request(
        "https://panel.example/api/platform/attachments/8c761995-a0c4-427b-bbf4-9c4d05fdc7d8",
      ),
      {
        params: Promise.resolve({
          path: ["attachments", "8c761995-a0c4-427b-bbf4-9c4d05fdc7d8"],
        }),
      },
    )
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: "Attachment access denied.",
    })
  })
  it("returns a structured missing-conversation response when speech generation rejects asynchronously", async () => {
    const response = await POST(
      new Request("https://panel.example/api/platform/voice/speech", {
        method: "POST",
        body: JSON.stringify({ id: "8c761995-a0c4-427b-bbf4-9c4d05fdc7d8" }),
      }),
      { params: Promise.resolve({ path: ["voice", "speech"] }) },
    )
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "Conversation not found." })
  })
})
