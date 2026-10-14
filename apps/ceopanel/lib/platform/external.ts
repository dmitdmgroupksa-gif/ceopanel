import "server-only"
import { ERPNextError } from "../erpnext-client"
import type { UserContext } from "./policy"
export type ExternalSource =
  | "bank"
  | "payment-gateway"
  | "government"
  | "fleet"
  | "iot"
export type ExternalResult = {
  company: string
  source: string
  updatedAt: string
  records: Record<string, string | number | null>[]
}
export type ExternalAdapter = {
  type: ExternalSource
  roles: string[]
  validated: boolean
  read: (context: UserContext) => Promise<ExternalResult>
}
// Provider schemas, credentials and reconciliation rules must be verified in staging.
// Connectors expose normalized read tools only; financial postings go through ERP proposals.
export const externalAdapters: Record<string, ExternalAdapter> = {}
export async function readExternal(context: UserContext, id: string) {
  const adapter = externalAdapters[id]
  if (!adapter?.validated)
    throw new ERPNextError(
      "External integration awaits staging validation.",
      409,
    )
  if (!adapter.roles.some((role) => context.roles.includes(role)))
    throw new ERPNextError("External source access denied.", 403)
  const result = await adapter.read(context)
  if (result.company !== context.company || !result.updatedAt)
    throw new ERPNextError(
      "External source returned invalid company or freshness information.",
      502,
    )
  return result
}
