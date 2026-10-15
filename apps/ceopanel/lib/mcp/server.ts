import "server-only"
import { createHash, randomUUID } from "node:crypto"
import { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import { businessPlugins } from "./plugins"
import { database, transaction } from "../platform/db"
import { platformConfig } from "../platform/config"
import { agentAccess } from "../platform/policy"
import { ERPNextError } from "../erpnext-client"
import type { ToolScope, PluginTool } from "./types"

export function visibleTools(scope: ToolScope) {
  if (scope.principal === "agent") {
    if (!scope.agent)
      throw new ERPNextError("An agent profile is required.", 403)
    agentAccess(scope.context, scope.agent)
    if (!platformConfig().aiDataApproved)
      throw new ERPNextError("AI data processing awaits approval.", 409)
  }
  const disabled = new Set(
    (process.env.MCP_DISABLED_PLUGINS || "").split(",").filter(Boolean),
  )
  return businessPlugins
    .filter((p) => !disabled.has(p.id))
    .flatMap((plugin) =>
      plugin.tools
        .filter(
          (t) =>
            (t.audience === "both" || t.audience === scope.principal) &&
            !(
              scope.principal === "agent" &&
              t.effect !== "read" &&
              (t.effect !== "proposal" || scope.canPropose === false)
            ),
        )
        .map((tool) => ({ plugin, tool })),
    )
}
export function createBusinessServer(scope: ToolScope) {
  const server = new McpServer({ name: "durar-masagh", version: "1.0.0" })
  for (const { plugin, tool } of visibleTools(scope))
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema,
        annotations: {
          readOnlyHint: tool.effect === "read",
          destructiveHint:
            tool.effect === "write" || tool.effect === "approval",
          idempotentHint: tool.effect === "read",
          openWorldHint: false,
        },
      },
      async (input) => invoke(scope, plugin.id, tool, input),
    )
  return server
}
async function invoke(
  scope: ToolScope,
  plugin: string,
  tool: PluginTool,
  input: unknown,
) {
  const id = randomUUID(),
    startedEvidence = scope.evidence.length
  try {
    await transaction(async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `mcp:${scope.principal}:${scope.context.company}:${scope.context.user}`,
      ])
      const counts = (
        await db.query(
          "SELECT count(*)::int AS recent,count(*) FILTER(WHERE status='running')::int AS active FROM mcp_tool_calls WHERE owner=$1 AND company=$2 AND principal=$3 AND created_at>now()-interval '1 minute'",
          [scope.context.user, scope.context.company, scope.principal],
        )
      ).rows[0]
      if (counts.recent >= 360 || counts.active >= 8)
        throw new ERPNextError(
          "Please wait before making more tool calls.",
          429,
        )
      await db.query(
        "INSERT INTO mcp_tool_calls(id,company,owner,agent,principal,grant_id,plugin,tool,arguments_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          id,
          scope.context.company,
          scope.context.user,
          scope.agent,
          scope.principal,
          scope.grantId,
          plugin,
          tool.name,
          createHash("sha256").update(JSON.stringify(input)).digest("hex"),
        ],
      )
    })
    // A remote request cannot set the principal, user, company or profile through tool arguments.
    const data = await tool.run(scope, input)
    const encoded = JSON.stringify({ data })
    if (encoded.length > (scope.principal === "agent" ? 220000 : 15000000))
      throw new ERPNextError(
        "Tool result is too large. Narrow the request.",
        413,
      )
    // The intent was durably logged before dispatch. A later audit outage must
    // not turn a confirmed ERP write into an apparent failure that invites a retry.
    let auditPending = false
    await database()
      .query(
        "UPDATE mcp_tool_calls SET status='completed',finished_at=now(),evidence=$2 WHERE id=$1",
        [id, JSON.stringify(scope.evidence.slice(startedEvidence))],
      )
      .catch(() => {
        auditPending = true
        console.error("MCP completion audit pending", id)
      })
    return {
      content: [{ type: "text" as const, text: encoded }],
      structuredContent: {
        data,
        ...(auditPending ? { auditPending: true } : {}),
      },
    }
  } catch (error) {
    const status =
      error instanceof ERPNextError
        ? error.status
        : error instanceof SyntaxError || error instanceof z.ZodError
          ? 400
          : 502
    await database()
      .query(
        "UPDATE mcp_tool_calls SET status='failed',error_code=$2,finished_at=now() WHERE id=$1 AND status='running'",
        [id, status],
      )
      .catch(() => {})
    const value = {
      error:
        error instanceof ERPNextError
          ? error.message
          : "This tool could not complete the request.",
      status,
    }
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify(value) }],
      structuredContent: value,
    }
  }
}
