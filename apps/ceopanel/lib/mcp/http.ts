import "server-only"
import { z } from "zod"
import { createMcpHandler } from "@modelcontextprotocol/server"
import { ERPNextError } from "../erpnext-client"
import { database } from "../platform/db"
import { permittedEvidence } from "../platform/evidence"
import { externalReady } from "./crypto"
import {
  authenticateMcp,
  resourceMetadata,
  authorizationMetadata,
} from "./oauth"
import { withDelegatedERP } from "./erp-identity"
import { createBusinessServer } from "./server"

export const noStore = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
}
export function cors(request: Request, response: Response) {
  const origin = request.headers.get("origin")
  const allowed = new Set([
    process.env.CEOPANEL_ORIGIN,
    ...(process.env.MCP_CLIENT_ORIGINS || "").split(",").filter(Boolean),
  ])
  if (origin && allowed.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin)
    response.headers.set("Vary", "Origin")
    response.headers.set(
      "Access-Control-Expose-Headers",
      "WWW-Authenticate,Mcp-Session-Id,Mcp-Protocol-Version",
    )
  }
  return response
}
export function preflight(request: Request) {
  try {
    trustedRequest(request)
    return cors(
      request,
      new Response(null, {
        status: 204,
        headers: {
          ...noStore,
          "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
          "Access-Control-Allow-Headers":
            "Authorization,Content-Type,Accept,Mcp-Protocol-Version,Mcp-Session-Id,Last-Event-ID",
          "Access-Control-Max-Age": "600",
        },
      }),
    )
  } catch (error) {
    return mcpError(error)
  }
}
export function trustedRequest(request: Request, browserOnly = false) {
  const origin = externalReady(),
    url = new URL(request.url)
  // CEOPANEL_ORIGIN is configured explicitly; proxy headers never select an issuer.
  // Next standalone uses an internal URL behind the HTTPS proxy. Validate the
  // actual HTTP Host; never use X-Forwarded-Host as an authentication input.
  const host = request.headers.get("host") || url.host
  if (host !== new URL(origin).host)
    throw new ERPNextError("Untrusted MCP host.", 403)
  const supplied = request.headers.get("origin")
  const allowed = new Set([
    origin,
    ...(process.env.MCP_CLIENT_ORIGINS || "").split(",").filter(Boolean),
  ])
  if (
    (browserOnly && supplied !== origin) ||
    (supplied && !allowed.has(supplied))
  )
    throw new ERPNextError("Untrusted MCP origin.", 403)
}
export async function boundedText(request: Request, limit = 24000) {
  const reader = request.body?.getReader()
  if (!reader) return ""
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > limit) {
      await reader.cancel()
      throw new ERPNextError("Request exceeds the MCP size limit.", 413)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString("utf8")
}
export function mcpError(error: unknown, oauth = false) {
  const status =
    error instanceof ERPNextError
      ? error.status
      : error instanceof z.ZodError || error instanceof SyntaxError
        ? 400
        : 502
  const message =
    error instanceof ERPNextError
      ? error.message
      : status === 400
        ? "Invalid request data."
        : "MCP request could not complete."
  let authenticate: Record<string, string> = {}
  if (status === 401) {
    try {
      authenticate = {
        "WWW-Authenticate": `Bearer resource_metadata="${externalReady()}/.well-known/oauth-protected-resource/api/mcp", scope="ceopanel:read ceopanel:propose"`,
      }
    } catch {}
  }
  return Response.json(
    oauth
      ? {
          error:
            status === 401
              ? "invalid_grant"
              : status === 429
                ? "temporarily_unavailable"
                : "invalid_request",
          error_description: message,
        }
      : { error: message },
    { status, headers: { ...noStore, ...authenticate } },
  )
}
export async function serveMcp(request: Request) {
  try {
    trustedRequest(request)
    const { claims, grant, context } = await authenticateMcp(request)
    return await withDelegatedERP(claims.sid, async () => {
      // Persist references between stateless calls, scoped to this exact consent.
      const rows = (
        await database().query(
          "SELECT id,agent,evidence FROM mcp_tool_calls WHERE grant_id=$1 AND company=$2 AND owner=$3 AND agent=$4 AND status='completed' AND jsonb_array_length(evidence)>0 AND created_at>now()-interval '15 minutes' ORDER BY created_at DESC LIMIT 5",
          [grant.id, context.company, context.user, claims.agent],
        )
      ).rows
      const evidence = (await permittedEvidence(context, rows)).flatMap(
        (r) => r.evidence,
      )
      const handler = createMcpHandler(
        () =>
          createBusinessServer({
            context,
            principal: "agent",
            agent: claims.agent,
            grantId: grant.id,
            canPropose: grant.scopes.includes("ceopanel:propose"),
            evidence,
          }),
        { maxRequestBodySize: 220000, maxSubscriptions: 0 },
      )
      const response = await handler.fetch(request)
      for (const [key, value] of Object.entries(noStore))
        response.headers.set(key, value)
      return cors(request, response)
    })
  } catch (error) {
    return cors(request, mcpError(error))
  }
}
export function metadata(kind: "authorization" | "resource") {
  try {
    return Response.json(
      kind === "authorization" ? authorizationMetadata() : resourceMetadata(),
      { headers: { ...noStore, "Access-Control-Allow-Origin": "*" } },
    )
  } catch (error) {
    return mcpError(error)
  }
}
