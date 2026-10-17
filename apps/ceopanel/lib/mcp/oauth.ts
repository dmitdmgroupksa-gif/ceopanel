import "server-only"
import { randomUUID } from "node:crypto"
import { cookies } from "next/headers"
import { z } from "zod"
import { database, transaction } from "../platform/db"
import { identity, agentAccess } from "../platform/auth"
import { aiDataApproved } from "../platform/config"
import { nativeReadAccess } from "../erp-native/read-policy"
import { ERP_READ_ONLY } from "../erp-access"
import { agents, type AgentId } from "../platform/catalog"
import { SESSION_COOKIE } from "../erpnext-server"
import { ERPNextError } from "../erpnext-client"
import { withDelegatedERP } from "./erp-identity"
import {
  digest,
  externalReady,
  pkceChallenge,
  redirectAllowed,
  seal,
  unseal,
} from "./crypto"
const readScope = "ceopanel:read",
  erpScope = "ceopanel:erp-read",
  proposalScope = "ceopanel:propose"
const authInput = z.object({
  response_type: z.literal("code"),
  client_id: z.uuid(),
  redirect_uri: z.string().url().max(2048),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code_challenge_method: z.literal("S256"),
  resource: z.string().url(),
  scope: z.string().max(300).default(`${readScope} ${erpScope}`),
  state: z.string().max(2048).optional(),
})
async function authorization(query: string) {
  const origin = externalReady(),
    input = authInput.parse(Object.fromEntries(new URLSearchParams(query)))
  if (input.resource !== `${origin}/api/mcp`)
    throw new ERPNextError("Invalid MCP resource audience.", 400)
  const scopes = [...new Set(input.scope.split(" ").filter(Boolean))]
  if (
    !scopes.includes(readScope) ||
    scopes.some(
      (s) =>
        ![readScope, erpScope, proposalScope, "offline_access"].includes(s),
    )
  )
    throw new ERPNextError("Unsupported MCP scope.", 400)
  const client = (
    await database().query("SELECT * FROM mcp_clients WHERE id=$1", [
      input.client_id,
    ])
  ).rows[0]
  if (!client || !client.redirect_uris.includes(input.redirect_uri))
    throw new ERPNextError("Unregistered MCP client or redirect URI.", 400)
  return { input, client, scopes }
}
export async function registerClient(raw: unknown) {
  externalReady()
  const input = z
    .object({
      client_name: z.string().min(1).max(100),
      redirect_uris: z.array(z.string().url().max(2048)).min(1).max(5),
      token_endpoint_auth_method: z.literal("none").default("none"),
      grant_types: z
        .array(z.enum(["authorization_code", "refresh_token"]))
        .optional(),
      response_types: z.array(z.literal("code")).optional(),
    })
    .parse(raw)
  if (input.redirect_uris.some((uri) => !redirectAllowed(uri)))
    throw new ERPNextError(
      "Register HTTPS or native loopback redirect URIs without credentials or fragments.",
      400,
    )
  const id = randomUUID()
  await transaction(async (db) => {
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtext('mcp-client-registration'))",
    )
    const count = (
      await db.query(
        "SELECT count(*)::int AS n FROM mcp_clients WHERE created_at>now()-interval '1 hour'",
      )
    ).rows[0].n
    if (count >= 120)
      throw new ERPNextError(
        "Client registration limit reached. Try later.",
        429,
      )
    await db.query(
      "INSERT INTO mcp_clients(id,name,redirect_uris) VALUES($1,$2,$3)",
      [
        id,
        input.client_name,
        JSON.stringify([...new Set(input.redirect_uris)]),
      ],
    )
  })
  return {
    ...input,
    client_id: id,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  }
}
export async function consentPreview(query: string, company?: string) {
  const { input, client, scopes } = await authorization(query)
  const context = await identity(company)
  const permitted = agents.filter((a) => {
    try {
      agentAccess(context, a.id)
      return true
    } catch {
      return false
    }
  })
  return {
    client: {
      id: client.id,
      name: client.name,
      redirectUri: input.redirect_uri,
    },
    context,
    agents: permitted.map(({ id, name, ar }) => ({ id, name, ar })),
    canPropose: !ERP_READ_ONLY && scopes.includes(proposalScope),
    erpRead: scopes.includes(erpScope),
  }
}
export async function authorizeClient(
  query: string,
  company: string,
  agent: AgentId,
  allowProposals: boolean,
  decision: "allow" | "deny",
) {
  const { input, client, scopes: requested } = await authorization(query)
  const redirect = new URL(input.redirect_uri)
  if (input.state !== undefined) redirect.searchParams.set("state", input.state)
  if (decision === "deny") {
    redirect.searchParams.set("error", "access_denied")
    return { redirect: redirect.href }
  }
  if (!aiDataApproved())
    throw new ERPNextError("AI data processing awaits company approval.", 409)
  const context = await identity(company)
  agentAccess(context, agent)
  if (requested.includes(erpScope) && !nativeReadAccess(context))
    throw new ERPNextError(
      "ERP-wide reading is not enabled for your account.",
      403,
    )
  const sid = (await cookies()).get(SESSION_COOKIE)?.value
  if (!sid) throw new ERPNextError("Sign in to ERPNext again.", 401)
  const scopes = requested.filter(
      (s) => s !== proposalScope || (!ERP_READ_ONLY && allowProposals),
    ),
    grant = randomUUID()
  const claims = {
    grant,
    client: client.id,
    user: context.user,
    company: context.company,
    agent,
    sid,
    scopes,
  }
  const code = seal(
    "code",
    {
      ...claims,
      redirect: input.redirect_uri,
      challenge: input.code_challenge,
    },
    120,
  )
  await transaction(async (db) => {
    await db.query(
      "INSERT INTO mcp_grants(id,client_id,owner,company,agent,scopes,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '8 hours')",
      [grant, client.id, context.user, context.company, agent, scopes],
    )
    await db.query(
      "INSERT INTO mcp_codes(hash,grant_id,expires_at) VALUES($1,$2,now()+interval '2 minutes')",
      [digest(code), grant],
    )
    await db.query(
      "INSERT INTO audit_events(actor,company,event,target,details) VALUES($1,$2,'mcp.consent',$3,$4)",
      [
        context.user,
        context.company,
        grant,
        JSON.stringify({ client: client.id, agent, scopes }),
      ],
    )
  })
  redirect.searchParams.set("code", code)
  return { redirect: redirect.href }
}
async function validateGrant(claims: Record<string, any>) {
  const parsed = z
    .object({
      grant: z.uuid(),
      client: z.uuid(),
      user: z.string().min(1),
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
      sid: z.string().regex(/^[A-Za-z0-9_-]+$/),
      scopes: z.array(z.string()),
    })
    .parse(claims)
  const grant = (
    await database().query(
      "SELECT * FROM mcp_grants WHERE id=$1 AND revoked_at IS NULL AND expires_at>now()",
      [parsed.grant],
    )
  ).rows[0]
  if (
    !grant ||
    grant.client_id !== parsed.client ||
    grant.owner !== parsed.user ||
    grant.company !== parsed.company ||
    grant.agent !== parsed.agent ||
    !grant.scopes.includes(readScope) ||
    parsed.scopes.length !== grant.scopes.length ||
    parsed.scopes.some((s) => !grant.scopes.includes(s))
  )
    throw new ERPNextError("MCP grant is invalid or revoked.", 401)
  const context = await withDelegatedERP(parsed.sid, () =>
    identity(parsed.company),
  )
  if (context.user !== parsed.user)
    throw new ERPNextError("ERP identity changed. Sign in again.", 401)
  agentAccess(context, parsed.agent)
  if (!aiDataApproved())
    throw new ERPNextError("AI data approval was withdrawn.", 403)
  return { claims: parsed, grant, context }
}
export async function exchangeToken(input: Record<string, string>) {
  externalReady()
  if (input.grant_type === "authorization_code") {
    const claims = unseal("code", input.code || "")
    if (
      !/^[A-Za-z0-9._~-]{43,128}$/.test(input.code_verifier || "") ||
      pkceChallenge(input.code_verifier) !== claims.challenge ||
      input.client_id !== claims.client ||
      input.redirect_uri !== claims.redirect ||
      input.resource !== claims.aud
    )
      throw new ERPNextError("Authorization code binding is invalid.", 400)
    await validateGrant(claims)
    return transaction(async (db) => {
      const used = await db.query(
        "UPDATE mcp_codes SET used_at=now() WHERE hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING grant_id",
        [digest(input.code)],
      )
      if (!used.rowCount)
        throw new ERPNextError(
          "Authorization code was already used or expired.",
          400,
        )
      return mint(db, claims)
    })
  }
  if (input.grant_type === "refresh_token") {
    const claims = unseal("refresh", input.refresh_token || "")
    if (input.client_id !== claims.client || input.resource !== claims.aud)
      throw new ERPNextError("Refresh token binding is invalid.", 400)
    await validateGrant(claims)
    const result = await transaction(async (db) => {
      const grant = (
        await db.query("SELECT * FROM mcp_grants WHERE id=$1 FOR UPDATE", [
          claims.grant,
        ])
      ).rows[0]
      if (
        !grant ||
        grant.revoked_at ||
        grant.refresh_hash !== digest(input.refresh_token)
      ) {
        await db.query("UPDATE mcp_grants SET revoked_at=now() WHERE id=$1", [
          claims.grant,
        ])
        return null
      }
      return mint(db, claims)
    })
    if (!result)
      throw new ERPNextError(
        "Refresh token reuse detected. Sign in again.",
        401,
      )
    return result
  }
  throw new ERPNextError("Unsupported OAuth grant type.", 400)
}
async function mint(db: import("pg").PoolClient, input: Record<string, any>) {
  const { grant, client, user, company, agent, sid, scopes } = input
  const active = (
    await db.query(
      "SELECT id FROM mcp_grants WHERE id=$1 AND revoked_at IS NULL AND expires_at>now() FOR UPDATE",
      [grant],
    )
  ).rows[0]
  if (!active) throw new ERPNextError("MCP grant expired or was revoked.", 401)
  const claims = {
    grant,
    client,
    user,
    company,
    agent,
    sid,
    scopes,
    nonce: randomUUID(),
  }
  const access = seal("access", claims, 900),
    refresh = seal("refresh", claims, 28800)
  await db.query("UPDATE mcp_grants SET refresh_hash=$2 WHERE id=$1", [
    grant,
    digest(refresh),
  ])
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: 900,
    refresh_token: refresh,
    scope: scopes.join(" "),
  }
}
export async function authenticateMcp(request: Request) {
  const value = request.headers.get("Authorization")
  if (!value?.startsWith("Bearer "))
    throw new ERPNextError("MCP sign-in required.", 401)
  return validateGrant(unseal("access", value.slice(7)))
}
export async function revokeToken(token: string, clientId: string) {
  const claims = unseal(
    token.startsWith("dm_refresh_") ? "refresh" : "access",
    token,
  )
  if (claims.client !== clientId)
    throw new ERPNextError("Client binding mismatch.", 400)
  await database().query(
    "UPDATE mcp_grants SET revoked_at=now(),refresh_hash=NULL WHERE id=$1",
    [claims.grant],
  )
}
export async function revokeOwnedGrant(id: string, company?: string) {
  const context = await identity(company)
  await database().query(
    "UPDATE mcp_grants SET revoked_at=now(),refresh_hash=NULL WHERE id=$1 AND owner=$2 AND company=$3",
    [z.uuid().parse(id), context.user, context.company],
  )
  return { revoked: true }
}
export function authorizationMetadata() {
  const origin = externalReady()
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/mcp/authorize`,
    token_endpoint: `${origin}/api/mcp/oauth/token`,
    registration_endpoint: `${origin}/api/mcp/oauth/register`,
    revocation_endpoint: `${origin}/api/mcp/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [
      readScope,
      erpScope,
      ...(!ERP_READ_ONLY ? [proposalScope] : []),
      "offline_access",
    ],
  }
}
export function resourceMetadata() {
  const origin = externalReady()
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: [
      readScope,
      erpScope,
      ...(!ERP_READ_ONLY ? [proposalScope] : []),
    ],
    bearer_methods_supported: ["header"],
  }
}
