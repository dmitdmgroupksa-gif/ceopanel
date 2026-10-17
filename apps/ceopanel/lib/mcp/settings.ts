import "server-only"
import type { UserContext } from "../platform/policy"
import { aiDataApproved } from "../platform/config"
import { nativeReadAccess } from "../erp-native/read-policy"
import { externalOrigin, externalReady } from "./crypto"
import { ERPNextError } from "../erpnext-client"

export type MCPConnectionSettings = {
  user: string
  company: string
  endpoint: string | null
  ready: boolean
  erpRead: boolean
  scopes: string[]
  reason: string | null
}

export function mcpConnectionSettings(context: UserContext): MCPConnectionSettings {
  let endpoint: string | null = null, reason: string | null = null
  const erpRead = nativeReadAccess(context)
  try {
    endpoint = `${externalOrigin()}/api/mcp`
    externalReady()
    if (!process.env.DATABASE_URL) reason = "MCP connection storage is not configured."
    else if (!aiDataApproved() || !erpRead) reason = "ERP reading is not enabled for your account. Ask your administrator."
  } catch (error) {
    reason = error instanceof ERPNextError ? error.message : "External MCP is unavailable."
  }
  return { user: context.user, company: context.company, endpoint, ready: !reason, erpRead, scopes: ["ceopanel:read", ...(erpRead ? ["ceopanel:erp-read"] : [])], reason }
}
