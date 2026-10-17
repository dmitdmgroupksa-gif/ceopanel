import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const sdk = vi.hoisted(() => ({ loads: 0 }))
const identityMock = vi.hoisted(() =>
  vi.fn(async () => ({
    user: "ceo@example.com",
    company: "Durar",
    roles: ["CEO"],
  })),
)
vi.mock("./auth", () => ({
  identity: identityMock,
  agentAccess: vi.fn(),
}))
vi.mock("../mcp/client", async () => {
  sdk.loads++
  const { ERPNextError } = await import("../erpnext-client")
  return {
    humanToolForContext: async (_context: unknown, name: string) => {
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
  it("returns status without loading the MCP server or agent integrations", async () => {
    expect(sdk.loads).toBe(0)
    const response = await GET(
      new Request("https://panel.example/api/platform/status"),
      { params: Promise.resolve({ path: ["status"] }) },
    )
    expect(response.status).toBe(200)
    expect(sdk.loads).toBe(0)
  })
  it.each([
    "field-updates",
    "knowledge/upload",
    "proposals/review",
    "proposals/edit",
    "notifications/read",
  ])("rejects disabled %s before reading its body", async (path) => {
    const response = await POST(
      new Request(`https://panel.example/api/platform/${path}`, {
        method: "POST",
        body: "not JSON or a multipart body",
      }),
      { params: Promise.resolve({ path: path.split("/") }) },
    )
    expect(response.status).toBe(403)
    expect((await response.json()).error).toContain("read-only")
  })
  it.each(["constructor", "__proto__", "toString"])(
    "does not dispatch inherited API names: %s",
    async (path) => {
      const response = await GET(
        new Request(`https://panel.example/api/platform/${path}`),
        { params: Promise.resolve({ path: [path] }) },
      )
      expect(response.status).toBe(404)
    },
  )
  it("restricts rollout configuration to native System Managers", async () => {
    const response = await GET(
      new Request("https://panel.example/api/platform/readiness?company=Durar"),
      {
        params: Promise.resolve({ path: ["readiness"] }),
      },
    )
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: "Administrator access required.",
    })
  })
  it("reports rollout configuration without requiring a platform database or echoing secrets", async () => {
    identityMock.mockResolvedValueOnce({
      user: "admin@example.com",
      company: "Durar",
      roles: ["System Manager"],
    })
    vi.stubEnv("OPENAI_API_KEY", "private-key-not-for-response")
    try {
      const response = await GET(
        new Request(
          "https://panel.example/api/platform/readiness?company=Durar",
        ),
        {
          params: Promise.resolve({ path: ["readiness"] }),
        },
      )
      expect(response.status).toBe(200)
      expect(response.headers.get("Cache-Control")).toBe("private, no-store")
      const report = await response.json()
      expect(report.liveAcceptanceRequired).toBe(true)
      expect(JSON.stringify(report)).not.toContain(
        "private-key-not-for-response",
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })
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
