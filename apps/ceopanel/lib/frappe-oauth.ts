import "server-only"
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"
import { z } from "zod"
import { ERPNextClient, ERPNextError } from "./erpnext-client"
import { database, transaction } from "./platform/db"
import { externalOrigin } from "./mcp/crypto"
import { safeReturnPath } from "./auth-navigation"
import { requestBody } from "./request-body"

export const FRAPPE_FLOW_COOKIE = "ceopanel_frappe_oauth"
export const isFrappeOAuthSession = (value: string) =>
  /^frappe_oauth_[a-f0-9]{64}$/.test(value)
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
export function frappeOAuthConfigured() {
  return (
    !!process.env.FRAPPE_OAUTH_CLIENT_ID &&
    !!process.env.FRAPPE_OAUTH_CLIENT_SECRET
  )
}
function configuration(site: string) {
  const origin = externalOrigin(),
    key =
      process.env.FRAPPE_OAUTH_SESSION_SECRET ||
      process.env.MCP_AUTH_SECRET ||
      ""
  if (!frappeOAuthConfigured() || !/^[a-fA-F0-9]{64}$/.test(key))
    throw new ERPNextError(
      "Frappe OAuth login needs its client and private session configuration.",
      503,
    )
  if (new URL(site).protocol !== "https:" || new URL(site).origin !== site)
    throw new ERPNextError(
      "Frappe OAuth requires the configured HTTPS ERP origin.",
      503,
    )
  return {
    origin,
    site,
    key: Buffer.from(key, "hex"),
    clientId: process.env.FRAPPE_OAUTH_CLIENT_ID!,
    clientSecret: process.env.FRAPPE_OAUTH_CLIENT_SECRET!,
    callback: `${origin}/api/erpnext/oauth/callback`,
  }
}
function encrypt(value: unknown, site: string, purpose: string) {
  const config = configuration(site),
    nonce = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", config.key, nonce)
  cipher.setAAD(Buffer.from(`${config.origin}|${site}|${purpose}|v1`))
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ])
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString(
    "base64url",
  )
}
function decrypt(value: string, site: string, purpose: string) {
  try {
    const config = configuration(site),
      bytes = Buffer.from(value, "base64url")
    const decipher = createDecipheriv(
      "aes-256-gcm",
      config.key,
      bytes.subarray(0, 12),
    )
    decipher.setAAD(Buffer.from(`${config.origin}|${site}|${purpose}|v1`))
    decipher.setAuthTag(bytes.subarray(12, 28))
    return JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    )
  } catch {
    throw new ERPNextError("Frappe login expired. Sign in again.", 401)
  }
}
const tokensSchema = z.object({
  access_token: z
    .string()
    .min(1)
    .max(4096)
    .regex(/^[A-Za-z0-9._~+\/-]+$/),
  refresh_token: z
    .string()
    .min(1)
    .max(4096)
    .regex(/^[A-Za-z0-9._~+\/-]+$/)
    .optional(),
  token_type: z.string().refine((s) => s.toLowerCase() === "bearer"),
  expires_in: z.coerce.number().int().positive().max(31536000),
})
async function tokenRequest(site: string, grant: Record<string, string>) {
  const config = configuration(site)
  let response: Response
  try {
    response = await fetch(
      `${site}/api/method/frappe.integrations.oauth2.get_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          ...grant,
        }),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    )
  } catch {
    throw new ERPNextError(
      "Frappe authorization is temporarily unavailable.",
      502,
    )
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new ERPNextError(
      "Frappe did not authorize this login. Sign in again.",
      response.status >= 500 ? 502 : 401,
    )
  }
  const result = tokensSchema.safeParse(
    JSON.parse(
      (
        await requestBody(response, 32000, "Invalid Frappe token response.")
      ).toString("utf8"),
    ),
  )
  if (!result.success)
    throw new ERPNextError(
      "Frappe returned an invalid authorization response.",
      502,
    )
  return result.data
}
function bearerClient(site: string, token: string) {
  const fetcher: typeof fetch = (url, init) => {
    const headers = new Headers(init?.headers)
    headers.delete("Cookie")
    headers.set("Authorization", `Bearer ${token}`)
    return fetch(url, { ...init, headers })
  }
  return new ERPNextClient(site, "oauth-user", fetcher)
}
export async function startFrappeLogin(site: string, next: string | null) {
  const config = configuration(site),
    state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(48).toString("base64url")
  await database().query("DELETE FROM erp_oauth_flows WHERE expires_at<now()")
  await database().query(
    "INSERT INTO erp_oauth_flows(id_hash,encrypted_verifier,return_path,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",
    [hash(state), encrypt({ verifier }, site, "flow"), safeReturnPath(next)],
  )
  const url = new URL("/api/method/frappe.integrations.oauth2.authorize", site)
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.callback,
    scope: "all openid",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString()
  return { state, redirect: url.href }
}
export async function completeFrappeLogin(
  site: string,
  state: string,
  browserState: string | undefined,
  code: string,
) {
  configuration(site)
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(state) ||
    state !== browserState ||
    !code ||
    code.length > 4096 ||
    /[\x00-\x20]/.test(code)
  )
    throw new ERPNextError(
      "Frappe login verification failed. Start sign-in again.",
      401,
    )
  const flow = (
    await database().query(
      "DELETE FROM erp_oauth_flows WHERE id_hash=$1 AND expires_at>now() RETURNING encrypted_verifier,return_path",
      [hash(state)],
    )
  ).rows[0]
  if (!flow)
    throw new ERPNextError(
      "Frappe login expired or was already completed.",
      401,
    )
  const { verifier } = decrypt(flow.encrypted_verifier, site, "flow")
  const tokens = await tokenRequest(site, {
    grant_type: "authorization_code",
    code,
    redirect_uri: configuration(site).callback,
    code_verifier: verifier,
  })
  const user = await bearerClient(site, tokens.access_token).user()
  const session = `frappe_oauth_${randomBytes(32).toString("hex")}`
  await database().query(
    "INSERT INTO erp_oauth_sessions(id_hash,owner,encrypted_tokens,token_expires_at,expires_at) VALUES($1,$2,$3,now()+$4*interval '1 second',now()+interval '8 hours')",
    [hash(session), user, encrypt(tokens, site, "session"), tokens.expires_in],
  )
  return { session, next: safeReturnPath(flow.return_path) }
}
export async function oauthERPClient(session: string, site: string) {
  if (!isFrappeOAuthSession(session))
    throw new ERPNextError("Invalid Frappe session.", 401)
  const row = (
    await database().query(
      "SELECT * FROM erp_oauth_sessions WHERE id_hash=$1 AND revoked_at IS NULL AND expires_at>now()",
      [hash(session)],
    )
  ).rows[0]
  if (!row) throw new ERPNextError("Frappe login expired or was revoked.", 401)
  let tokens = tokensSchema.parse(
    decrypt(row.encrypted_tokens, site, "session"),
  )
  if (new Date(row.token_expires_at).getTime() <= Date.now() + 30000) {
    tokens = await transaction(async (db) => {
      const current = (
        await db.query(
          "SELECT * FROM erp_oauth_sessions WHERE id_hash=$1 AND revoked_at IS NULL AND expires_at>now() FOR UPDATE",
          [hash(session)],
        )
      ).rows[0]
      if (!current)
        throw new ERPNextError("Frappe login expired or was revoked.", 401)
      const previous = tokensSchema.parse(
        decrypt(current.encrypted_tokens, site, "session"),
      )
      if (new Date(current.token_expires_at).getTime() > Date.now() + 30000)
        return previous
      if (!previous.refresh_token)
        throw new ERPNextError("Frappe login expired. Sign in again.", 401)
      const refreshed = await tokenRequest(site, {
        grant_type: "refresh_token",
        refresh_token: previous.refresh_token,
      })
      if (
        (await bearerClient(site, refreshed.access_token).user()) !==
        current.owner
      )
        throw new ERPNextError("Frappe identity changed. Sign in again.", 401)
      const next = {
        ...refreshed,
        refresh_token: refreshed.refresh_token || previous.refresh_token,
      }
      await db.query(
        "UPDATE erp_oauth_sessions SET encrypted_tokens=$2,token_expires_at=now()+$3*interval '1 second' WHERE id_hash=$1",
        [hash(session), encrypt(next, site, "session"), next.expires_in],
      )
      return next
    })
  }
  const client = bearerClient(site, tokens.access_token)
  if ((await client.user()) !== row.owner)
    throw new ERPNextError("Frappe identity changed. Sign in again.", 401)
  return client
}
export async function revokeFrappeLogin(session: string, site: string) {
  const row = (
    await database().query(
      "UPDATE erp_oauth_sessions SET revoked_at=now() WHERE id_hash=$1 RETURNING encrypted_tokens",
      [hash(session)],
    )
  ).rows[0]
  if (!row) return true
  try {
    const tokens = tokensSchema.parse(
        decrypt(row.encrypted_tokens, site, "session"),
      ),
      config = configuration(site)
    const response = await fetch(
      `${site}/api/method/frappe.integrations.oauth2.revoke_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: tokens.access_token,
          token_type_hint: "access_token",
          client_id: config.clientId,
          client_secret: config.clientSecret,
        }),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    )
    await response.body?.cancel()
    return response.ok
  } catch {
    return false
  }
}
