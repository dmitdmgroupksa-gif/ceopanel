import "server-only"
import { ERPNextError } from "../erpnext-client"
import type { UserContext } from "./policy"
import { platformConfig } from "./config"
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
  records: Record<string, string | number | boolean | null>[]
  hasMore?: boolean
  retrievedAt?: string
  freshnessBasis?: "erp-read" | "provider-as-of"
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
export function externalCatalog(context: UserContext) {
  return (platformConfig().externalSources || [])
    .filter(
      (s) =>
        s.roles.some((r) => context.roles.includes(r)) ||
        context.roles.includes("System Manager"),
    )
    .map((s) => ({
      id: s.id,
      title: s.title,
      type: s.type,
      country: s.country,
      connection: s.connection,
      state: !s.readValidated
        ? "awaiting_configuration"
        : s.connection === "erpnext"
          ? "mapped_awaiting_live_check"
          : externalAdapters[s.id]?.validated
            ? "adapter_awaiting_live_check"
            : "awaiting_provider_adapter",
    }))
}
export async function readExternal(context: UserContext, id: string) {
  const source = (platformConfig().externalSources || []).find(
    (s) => s.id === id,
  )
  if (!source?.roles.some((role) => context.roles.includes(role)))
    throw new ERPNextError("External source access denied.", 403)
  if (!source.readValidated)
    throw new ERPNextError(
      "External integration awaits staging validation.",
      409,
    )
  if (source.connection === "erpnext") {
    const { workspaceList } = await import("../workspace-server")
    const results = await Promise.all(
      source.modules.map(async (module) => ({
        module,
        ...(await workspaceList(module, context.company, {
          search: "",
          offset: 0,
          limit: 50,
        })),
      })),
    )
    return {
      company: context.company,
      source: source.id,
      updatedAt: new Date().toISOString(),
      freshnessBasis: "erp-read",
      hasMore: results.some((r) => r.hasMore),
      records: results.flatMap((r) =>
        r.records.map((record) => ({
          ...Object.fromEntries(
            Object.entries(record.values).filter(
              ([, v]) =>
                v === null ||
                typeof v === "string" ||
                typeof v === "number" ||
                typeof v === "boolean",
            ),
          ),
          module: r.module,
          name: record.name,
          modified: record.modified,
        })),
      ),
    } satisfies ExternalResult
  }
  const adapter = externalAdapters[id]
  if (!adapter?.validated || adapter.type !== source.type)
    throw new ERPNextError(
      "External integration awaits staging validation.",
      409,
    )
  if (!adapter.roles.some((role) => context.roles.includes(role)))
    throw new ERPNextError("External source access denied.", 403)
  const result = await adapter.read(context)
  if (
    result.company !== context.company ||
    result.source !== source.provider ||
    !Number.isFinite(Date.parse(result.updatedAt))
  )
    throw new ERPNextError(
      "External source returned invalid company or freshness information.",
      502,
    )
  return result
}
