import { afterEach, describe, expect, it, vi } from "vitest"
import { Client, InMemoryTransport } from "@modelcontextprotocol/client"
vi.mock("server-only", () => ({}))
const mock = vi.hoisted(() => ({
  erp: {} as any,
  query: vi.fn(async (_sql: string, _parameters?: unknown[]) => ({
    rows: [{ recent: 0, active: 0 }],
    rowCount: 1,
  })),
}))
vi.mock("../erpnext-server", () => ({
  client: async () => mock.erp,
  siteUrl: () => "https://erp.example",
  timezone: "Asia/Riyadh",
}))
vi.mock("../platform/db", () => ({
  database: () => ({ query: mock.query }),
  transaction: (fn: any) => fn({ query: mock.query }),
}))
import { createBusinessServer, visibleTools } from "./server"
import { ERPNextClient, ERPNextError } from "../erpnext-client"
import { erpReadPlugin } from "./erp-plugin"
import type { ToolScope } from "./types"
import { permittedEvidence } from "../platform/evidence"

function scope(erpRead = true): ToolScope {
  return {
    principal: "agent",
    agent: "executive",
    erpRead,
    evidence: [],
    context: {
      user: "reader",
      company: "Company A",
      currency: "SAR",
      siteUrl: "https://erp.example",
      roles: ["System Manager"],
      companies: [],
    },
  }
}
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
describe("native ERP MCP protocol", () => {
  it("exposes the employee's multiple companies without accepting identity overrides", async () => {
    vi.stubEnv("ERP_AI_READ_ENABLED", "true")
    vi.stubEnv("ERP_AI_READ_ROLES", "Desk User")
    const own = scope()
    own.context.roles = ["Desk User", "Employee"]
    own.context.companies = [
      { name: "Company A", default_currency: "SAR" },
      { name: "Company B", default_currency: "USD" },
    ]
    const c = await connected(own)
    try {
      const result = await c.client.callTool({
        name: "erp_list_companies",
        arguments: {},
      })
      expect(result.isError).not.toBe(true)
      expect(result.structuredContent).toMatchObject({
        data: {
          companies: [
            { name: "Company A", currency: "SAR" },
            { name: "Company B", currency: "USD" },
          ],
        },
      })
      const invalid = await c.client.callTool({
        name: "erp_list_companies",
        arguments: { user: "Administrator" },
      })
      expect(invalid.isError).toBe(true)
    } finally {
      await c.close()
    }
  })
  async function connected(s = scope()) {
    const server = createBusinessServer(s)
    const client = new Client({ name: "showcase-test", version: "1" })
    const [a, b] = InMemoryTransport.createLinkedPair()
    await server.connect(a)
    await client.connect(b)
    return {
      client,
      close: async () => {
        await client.close()
        await server.close()
      },
    }
  }
  it("advertises read-only instructions, clear titles, bounded schemas and external OAuth scopes", async () => {
    vi.stubEnv("ERP_AI_READ_ENABLED", "true")
    const s = scope()
    s.grantId = "showcase-grant"
    const c = await connected(s)
    try {
      expect(c.client.getInstructions()).toContain("Read-only ERP access")
      const tools = (await c.client.listTools()).tools
      const records = tools.find((t) => t.name === "erp_search_records")!
      expect(records).toMatchObject({
        title: "Search ERP records",
        annotations: { readOnlyHint: true, destructiveHint: false },
        _meta: {
          securitySchemes: [
            { type: "oauth2", scopes: ["ceopanel:read", "ceopanel:erp-read"] },
          ],
        },
      })
      expect(records.inputSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
        properties: { offset: { maximum: 100000 } },
      })
      expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(
        true,
      )
      for (const args of [
        { doctype: " " },
        { doctype: "Quotation\n" },
        { doctype: "Quotation", offset: 100001 },
        { doctype: "Quotation", company: "forged" },
      ]) {
        expect(
          (
            await c.client.callTool({
              name: "erp_search_records",
              arguments: args,
            })
          ).isError,
        ).toBe(true)
      }
      expect(mock.query).not.toHaveBeenCalled()
    } finally {
      await c.close()
    }
  })
  it("provides actionable required-filter errors and distinguishes denied access from sign-in expiry", async () => {
    vi.stubEnv("ERP_AI_READ_ENABLED", "true")
    vi.stubEnv("MCP_EXTERNAL_ENABLED", "true")
    vi.stubEnv("CEOPANEL_ORIGIN", "https://panel.example")
    vi.stubEnv("MCP_AUTH_SECRET", "ab".repeat(32))
    const tool = erpReadPlugin.tools.find((t) => t.name === "erp_run_report")!
    const run = vi.spyOn(tool, "run")
    const s = scope()
    s.grantId = "showcase-grant"
    const c = await connected(s)
    try {
      run.mockRejectedValueOnce(
        new ERPNextError("Report requires filter: from_date.", 400),
      )
      const invalid = await c.client.callTool({
        name: tool.name,
        arguments: { report: "Report" },
      })
      expect(invalid).toMatchObject({
        isError: true,
        structuredContent: {
          status: 400,
          code: "invalid_arguments",
          retryable: false,
        },
      })
      expect((invalid.structuredContent as any).nextStep).toContain(
        "exact required",
      )
      run.mockRejectedValueOnce(
        new ERPNextError("ERP read permission denied.", 403),
      )
      const denied = await c.client.callTool({
        name: tool.name,
        arguments: { report: "Report" },
      })
      expect(denied.structuredContent).toMatchObject({
        code: "permission_denied",
        retryable: false,
      })
      expect(denied._meta?.["mcp/www_authenticate"]).toBeUndefined()
      run.mockRejectedValueOnce(new ERPNextError("ERP session expired.", 401))
      const expired = await c.client.callTool({
        name: tool.name,
        arguments: { report: "Report" },
      })
      expect(expired.structuredContent).toMatchObject({
        code: "authentication_required",
        retryable: false,
      })
      expect(
        (expired._meta?.["mcp/www_authenticate"] as string[])[0],
      ).toContain('error="invalid_token"')
    } finally {
      await c.close()
    }
  })
  it("isolates evidence for concurrent tool calls and discards evidence from failed or oversized results", async () => {
    vi.stubEnv("ERP_AI_READ_ENABLED", "true")
    const tool = erpReadPlugin.tools.find(
      (t) => t.name === "erp_read_document",
    )!
    let unblock!: () => void
    const barrier = new Promise<void>((resolve) => {
      unblock = resolve
    })
    let started = 0
    const run = vi.spyOn(tool, "run").mockImplementation(async (s, args) => {
      s.evidence.push({ source: args.name })
      if (++started === 2) unblock()
      await barrier
      return { name: args.name }
    })
    const s = scope()
    const c = await connected(s)
    try {
      const results = await Promise.all(
        ["Q-1", "Q-2"].map((name) =>
          c.client.callTool({
            name: tool.name,
            arguments: { doctype: "Quotation", name },
          }),
        ),
      )
      expect(results.every((r) => r.isError === false)).toBe(true)
      const completed = mock.query.mock.calls.filter(([sql]) =>
        String(sql).includes("status='completed'"),
      )
      expect(
        completed.map(([, params]) => JSON.parse((params as any)[1])),
      ).toEqual(
        expect.arrayContaining([[{ source: "Q-1" }], [{ source: "Q-2" }]]),
      )
      expect(s.evidence).toHaveLength(2)
      run.mockImplementationOnce(async (scope) => {
        scope.evidence.push({ source: "failed" })
        throw Error("private traceback")
      })
      const failed = await c.client.callTool({
        name: tool.name,
        arguments: { doctype: "Quotation", name: "bad" },
      })
      expect(JSON.stringify(failed)).not.toContain("private traceback")
      run.mockImplementationOnce(async (scope) => {
        scope.evidence.push({ source: "too-large" })
        return "x".repeat(220001)
      })
      const large = await c.client.callTool({
        name: tool.name,
        arguments: { doctype: "Quotation", name: "large" },
      })
      expect(large.structuredContent).toMatchObject({
        code: "result_too_large",
        status: 413,
      })
      expect(s.evidence).toHaveLength(2)
    } finally {
      await c.close()
    }
  })
  it("revalidates historical native evidence and hides changed or revoked records", async () => {
    vi.stubEnv("ERP_AI_READ_ENABLED", "true")
    let amount = 10,
      permitted = true
    const fetcher = vi.fn<typeof fetch>(async (raw) => {
      const path = new URL(String(raw)).pathname
      if (path.endsWith("has_permission"))
        return Response.json({ message: { has_permission: permitted } })
      if (path.endsWith("getdoctype"))
        return Response.json({
          docs: [
            {
              name: "Quotation",
              module: "Selling",
              fields: [{ fieldname: "grand_total", fieldtype: "Currency" }],
            },
          ],
        })
      return Response.json({
        message: { doctype: "Quotation", name: "Q-1", grand_total: amount },
      })
    })
    mock.erp = new ERPNextClient("https://erp.example", "sid", fetcher)
    const s = scope(),
      server = createBusinessServer(s),
      client = new Client({ name: "history", version: "1" })
    const [a, b] = InMemoryTransport.createLinkedPair()
    await server.connect(a)
    await client.connect(b)
    try {
      await client.callTool({
        name: "erp_read_document",
        arguments: { doctype: "Quotation", name: "Q-1" },
      })
      const items = [{ id: "run", agent: "executive", evidence: s.evidence }]
      expect(await permittedEvidence(s.context, items)).toHaveLength(1)
      amount = 20
      expect(await permittedEvidence(s.context, items)).toEqual([])
      amount = 10
      permitted = false
      expect(await permittedEvidence(s.context, items)).toEqual([])
    } finally {
      await client.close()
      await server.close()
    }
  })
  it("requires ERP-wide consent and excludes every ERP mutation tool", () => {
    vi.stubEnv("ERP_AI_READ_ENABLED", "true")
    const names = visibleTools(scope()).map(({ tool }) => {
      expect(tool.effect).toBe("read")
      return tool.name
    })
    expect(names).toContain("erp_search_sources")
    expect(names).toContain("erp_check_approvals")
    expect(names).toContain("erp_export_file")
    expect(names).not.toContain("propose_action")
    expect(
      visibleTools(scope(false)).some(({ tool }) => tool.requiresERPRead),
    ).toBe(false)
    const other = scope()
    other.context.roles = ["Employee"]
    expect(() => visibleTools(other)).toThrow("not available")
  })
  it("delivers a resource link, a permission-checked resources/read PDF and an embedded file without base64 in structured model output", async () => {
    vi.stubEnv("ERP_AI_READ_ENABLED", "true")
    const calls: string[] = []
    const fetcher = vi.fn<typeof fetch>(async (raw) => {
      const url = new URL(String(raw))
      calls.push(url.pathname)
      if (url.pathname.endsWith("has_permission"))
        return Response.json({ message: { has_permission: true } })
      if (url.pathname.endsWith("getdoctype"))
        return Response.json({
          docs: [
            {
              name: "Quotation",
              module: "Selling",
              fields: [{ fieldname: "grand_total", fieldtype: "Currency" }],
            },
          ],
        })
      if (url.pathname.endsWith("download_pdf"))
        return new Response("%PDF-1.7 test PDF")
      return Response.json({
        message: { doctype: "Quotation", name: "Q-1", grand_total: 10 },
      })
    })
    mock.erp = new ERPNextClient("https://erp.example", "native-sid", fetcher)
    const externalScope = scope()
    externalScope.grantId = "showcase-grant"
    const server = createBusinessServer(externalScope),
      client = new Client({ name: "test-client", version: "1.0" })
    const [a, b] = InMemoryTransport.createLinkedPair()
    await server.connect(a)
    await client.connect(b)
    try {
      const request = { kind: "document", doctype: "Quotation", name: "Q-1" }
      const result = await client.callTool({
        name: "erp_export_file",
        arguments: { request, delivery: "link" },
      })
      expect(result.isError).not.toBe(true)
      const link = result.content.find((c) => c.type === "resource_link")!
      expect(link.type).toBe("resource_link")
      expect(JSON.stringify(result.structuredContent)).not.toContain("base64")
      expect(JSON.stringify(result)).not.toContain("downloadUrl")
      expect((result.structuredContent as any).data.file).toMatchObject({
        delivery: "resource_link",
        downloadInstructions: expect.stringContaining("resources/read"),
      })
      const resources = await client.readResource({ uri: link.uri })
      expect(resources.contents[0]).toMatchObject({
        mimeType: "application/pdf",
        blob: Buffer.from("%PDF-1.7 test PDF").toString("base64"),
      })
      const embedded = await client.callTool({
        name: "erp_export_file",
        arguments: { request, delivery: "embedded" },
      })
      expect(embedded.content.find((c) => c.type === "resource")).toMatchObject(
        { resource: { mimeType: "application/pdf" } },
      )
      expect(
        calls.filter((p) => p.endsWith("has_permission")).length,
      ).toBeGreaterThanOrEqual(6)
      expect(mock.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO mcp_tool_calls"),
        expect.any(Array),
      )
    } finally {
      await client.close()
      await server.close()
    }
  })
  it("does not leak upstream errors or advertise broad resources to an older grant", async () => {
    vi.stubEnv("ERP_AI_READ_ENABLED", "true")
    const server = createBusinessServer(scope(false)),
      client = new Client({ name: "old-client", version: "1.0" })
    const [a, b] = InMemoryTransport.createLinkedPair()
    await server.connect(a)
    await client.connect(b)
    try {
      expect(
        (await client.listTools()).tools.some((t) => t.name.startsWith("erp_")),
      ).toBe(false)
      await expect(
        client.callTool({ name: "erp_export_file", arguments: {} }),
      ).rejects.toThrow("not found")
    } finally {
      await client.close()
      await server.close()
    }
  })
})
