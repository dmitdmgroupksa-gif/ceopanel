import "server-only"
import { Client, InMemoryTransport } from "@modelcontextprotocol/client"
import { createBusinessServer } from "./server"
import type { ToolScope } from "./types"
import { ERPNextError } from "../erpnext-client"
import { identity } from "../platform/auth"
import type { UserContext } from "../platform/policy"
import { isAllCompanies } from "../company-scope"

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
      args: Record<string, unknown> = {}
    ): Promise<T> => {
      const result = await client.callTool({ name, arguments: args })
      const value = result.structuredContent as
        | { data?: T; error?: string; status?: number }
        | undefined
      if (result.isError && !value)
        throw new ERPNextError(
          "Tool unavailable or invalid tool arguments.",
          400
        )
      if (result.isError || !value || !Object.hasOwn(value, "data"))
        throw new ERPNextError(
          value?.error || "Tool unavailable.",
          value?.status || 502
        )
      return value.data as T
    },
    close: async () => {
      try {
        await client.close()
      } finally {
        await server.close()
      }
    },
  }
}
export async function humanTool<T>(
  company: string | undefined,
  name: string,
  args: Record<string, unknown> = {}
) {
  return humanToolForContext<T>(await identity(company), name, args)
}
export async function humanToolForContext<T>(
  context: UserContext,
  name: string,
  args: Record<string, unknown> = {}
) {
  if (
    isAllCompanies(context.company) &&
    [
      "agent_history",
      "channel_inbox",
      "notifications_list",
      "knowledge_catalog",
      "knowledge_search",
    ].includes(name)
  ) {
    const results: any[] = []
    for (const company of [
      ...context.companies,
      { name: context.company, default_currency: context.currency },
    ])
      results.push(
        await callHuman<any>(
          {
            ...context,
            company: company.name,
            currency: company.default_currency || "SAR",
          },
          name,
          args
        )
      )
    if (name === "knowledge_catalog")
      return {
        documents: results.flatMap((r) => r.documents),
        collections: results[0]?.collections || [],
      } as T
    return results
      .flat()
      .sort((a, b) =>
        String(b.created_at || "").localeCompare(String(a.created_at || ""))
      ) as T
  }
  return callHuman<T>(context, name, args)
}
async function callHuman<T>(
  context: UserContext,
  name: string,
  args: Record<string, unknown>
) {
  const tools = await connectBusinessTools({
    context,
    principal: "human",
    evidence: [],
  })
  try {
    return await tools.call<T>(name, args)
  } finally {
    await tools.close()
  }
}
