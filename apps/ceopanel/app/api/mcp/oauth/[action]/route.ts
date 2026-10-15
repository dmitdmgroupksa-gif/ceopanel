import { z } from "zod"
import {
  authorizeClient,
  consentPreview,
  exchangeToken,
  registerClient,
  revokeOwnedGrant,
  revokeToken,
} from "@/lib/mcp/oauth"
import {
  boundedText,
  trustedRequest,
  mcpError,
  noStore,
  cors,
  preflight,
} from "@/lib/mcp/http"
import { ERPNextError } from "@/lib/erpnext-client"
import { identity } from "@/lib/platform/auth"
import { database } from "@/lib/platform/db"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
type Context = { params: Promise<{ action: string }> }
export async function GET(request: Request, { params }: Context) {
  try {
    trustedRequest(request)
    const action = (await params).action,
      query = new URL(request.url).searchParams
    if (action === "consent")
      return Response.json(
        await consentPreview(
          query.get("query") || "",
          query.get("company") || undefined,
        ),
        { headers: noStore },
      )
    if (action === "grants") {
      const context = await identity(query.get("company") || undefined)
      return Response.json(
        (
          await database().query(
            "SELECT g.id,c.name AS client,g.agent,g.scopes,g.expires_at,g.revoked_at,g.created_at FROM mcp_grants g JOIN mcp_clients c ON c.id=g.client_id WHERE g.owner=$1 AND g.company=$2 ORDER BY g.created_at DESC LIMIT 100",
            [context.user, context.company],
          )
        ).rows,
        { headers: noStore },
      )
    }
    throw new ERPNextError("OAuth endpoint not found.", 404)
  } catch (error) {
    return mcpError(error, true)
  }
}
async function post(request: Request, { params }: Context) {
  try {
    const action = (await params).action
    trustedRequest(request, action === "authorize" || action === "revoke-owned")
    const raw = await boundedText(request)
    if (action === "register")
      return Response.json(await registerClient(JSON.parse(raw)), {
        status: 201,
        headers: noStore,
      })
    if (action === "token" || action === "revoke") {
      if (
        !request.headers
          .get("Content-Type")
          ?.startsWith("application/x-www-form-urlencoded")
      )
        throw new ERPNextError("Use form-encoded OAuth requests.", 400)
      const form = Object.fromEntries(new URLSearchParams(raw))
      if (action === "token")
        return Response.json(await exchangeToken(form), { headers: noStore })
      // RFC 7009: an already invalid token is successfully revoked.
      try {
        await revokeToken(form.token || "", form.client_id || "")
      } catch (error) {
        if (
          !(error instanceof ERPNextError) ||
          ![400, 401].includes(error.status)
        )
          throw error
      }
      return new Response(null, { status: 200, headers: noStore })
    }
    const body = JSON.parse(raw)
    if (action === "authorize") {
      const input = z
        .object({
          query: z.string().max(10000),
          company: z.string().min(1),
          agent: z.enum([
            "sales",
            "finance",
            "inventory",
            "procurement",
            "logistics",
            "hr",
            "facilities",
            "executive",
          ]),
          allowProposals: z.boolean(),
          decision: z.enum(["allow", "deny"]),
        })
        .strict()
        .parse(body)
      return Response.json(
        await authorizeClient(
          input.query,
          input.company,
          input.agent,
          input.allowProposals,
          input.decision,
        ),
        { headers: noStore },
      )
    }
    if (action === "revoke-owned") {
      const input = z
        .object({ id: z.uuid(), company: z.string().optional() })
        .strict()
        .parse(body)
      return Response.json(await revokeOwnedGrant(input.id, input.company), {
        headers: noStore,
      })
    }
    throw new ERPNextError("OAuth endpoint not found.", 404)
  } catch (error) {
    return mcpError(error, true)
  }
}
export const OPTIONS = preflight
export async function POST(request: Request, context: Context) {
  return cors(request, await post(request, context))
}
