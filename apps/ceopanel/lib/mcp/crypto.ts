import "server-only"
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"
import { ERPNextError } from "../erpnext-client"
export function externalOrigin() {
  const value = process.env.CEOPANEL_ORIGIN || ""
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ERPNextError("External MCP awaits a public origin.", 503)
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.hash ||
    url.search ||
    (url.protocol !== "https:" &&
      !(
        process.env.NODE_ENV !== "production" &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new ERPNextError("External MCP requires a trusted HTTPS origin.", 503)
  return url.origin
}
export function externalReady() {
  if (
    process.env.MCP_EXTERNAL_ENABLED !== "true" ||
    !/^[a-fA-F0-9]{64}$/.test(process.env.MCP_AUTH_SECRET || "")
  )
    throw new ERPNextError(
      "External MCP awaits authentication and data approval configuration.",
      503,
    )
  return externalOrigin()
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex")
export const pkceChallenge = (verifier: string) =>
  createHash("sha256").update(verifier).digest("base64url")
export function seal(
  purpose: "code" | "access" | "refresh",
  claims: Record<string, unknown>,
  lifetime: number,
) {
  const origin = externalReady(),
    nonce = randomBytes(12)
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(process.env.MCP_AUTH_SECRET!, "hex"),
    nonce,
  )
  const aad = Buffer.from(`ceopanel-mcp:${purpose}:v1:${origin}`)
  cipher.setAAD(aad)
  const ciphertext = Buffer.concat([
    cipher.update(
      JSON.stringify({
        ...claims,
        iss: origin,
        aud: `${origin}/api/mcp`,
        exp: Math.floor(Date.now() / 1000) + lifetime,
      }),
    ),
    cipher.final(),
  ])
  return `dm_${purpose}_v1.${Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64url")}`
}
export function unseal(
  purpose: "code" | "access" | "refresh",
  token: string,
): Record<string, any> {
  const origin = externalReady()
  try {
    if (!token.startsWith(`dm_${purpose}_v1.`) || token.length > 16000)
      throw new Error()
    const bytes = Buffer.from(token.slice(token.indexOf(".") + 1), "base64url")
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(process.env.MCP_AUTH_SECRET!, "hex"),
      bytes.subarray(0, 12),
    )
    decipher.setAAD(Buffer.from(`ceopanel-mcp:${purpose}:v1:${origin}`))
    decipher.setAuthTag(bytes.subarray(12, 28))
    const value = JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    )
    if (
      value.iss !== origin ||
      value.aud !== `${origin}/api/mcp` ||
      !Number.isInteger(value.exp) ||
      value.exp <= Date.now() / 1000
    )
      throw new Error()
    return value
  } catch {
    throw new ERPNextError(
      "MCP authorization expired or is invalid. Sign in again.",
      401,
    )
  }
}
export function redirectAllowed(value: string) {
  try {
    const url = new URL(value)
    return (
      !url.username &&
      !url.password &&
      !url.hash &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)))
    )
  } catch {
    return false
  }
}
