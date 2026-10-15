import "server-only"
import { Client, InMemoryTransport } from "@modelcontextprotocol/client"
import { createBusinessServer } from "./server"
import type { ToolScope } from "./types"
import { ERPNextError } from "../erpnext-client"
import { identity } from "../platform/auth"

// Real MCP discovery/call messages, without an unnecessary network hop inside the app.
export async function connectBusinessTools(scope: ToolScope) {
  const server = createBusinessServer(scope),
    client = new Client({ name: "ceopanel", version: "1.0.0" })
  const [serverTransport, clientTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  try {
    await client.connect(clientTransport)
  } catch (error) {
    await server.close()
    throw error
  }
  return {
    list: async () => (await client.listTools()).tools,
    call: async <T = unknown>(
      name: string,
      args: Record<string, unknown> = {},
    ): Promise<T> => {
      const result = await client.callTool({ name, arguments: args })
      const value = result.structuredContent as
        | { data?: T; error?: string; status?: number }
        | undefined
      if (result.isError && !value)
        throw new ERPNextError(
          "Tool unavailable or invalid tool arguments.",
          400,
        )
      if (result.isError || !value || !Object.hasOwn(value, "data"))
        throw new ERPNextError(
          value?.error || "Tool unavailable.",
          value?.status || 502,
        )
      return value.data as T
    },
    close: async () => {
      await client.close()
      await server.close()
    },
  }
}
export async function humanTool<T>(
  company: string | undefined,
  name: string,
  args: Record<string, unknown> = {},
) {
  const tools = await connectBusinessTools({
    context: await identity(company),
    principal: "human",
    evidence: [],
  })
  try {
    return await tools.call<T>(name, args)
  } finally {
    await tools.close()
  }
}
