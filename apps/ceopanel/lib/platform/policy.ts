import { ERPNextError } from "../erpnext-client"
import { platformConfig } from "./config"
import { agents, type AgentId } from "./catalog"
import type { DashboardContext } from "../dashboard-server"
import { nativeReadAccess, nativeReadRoles } from "../erp-native/read-policy"
export type UserContext = DashboardContext & { roles: string[] }
export function companyValues(
  input: unknown,
  field: string | undefined,
  company: string,
): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ERPNextError("Enter valid record fields.", 400)
  const values = { ...input } as Record<string, unknown>
  if (field) {
    if (Object.hasOwn(values, field) && values[field] !== company)
      throw new ERPNextError("Record company mismatch.", 403)
    delete values[field]
  }
  return values
}
export function agentAccess(context: UserContext, id: string) {
  const agent = agents.find((a) => a.id === id),
    mapping =
      platformConfig().agents[id] ??
      (nativeReadAccess(context)
        ? { roles: nativeReadRoles(), modules: [], reports: [], approvers: [] }
        : undefined)
  if (
    !agent ||
    !mapping ||
    !mapping.roles.some((r) => context.roles.includes(r))
  )
    throw new ERPNextError("This agent is not available to your account.", 403)
  return { agent, mapping }
}
export function moduleAccess(
  context: UserContext,
  agent: AgentId,
  module: string,
) {
  const { mapping } = agentAccess(context, agent)
  if (!mapping.modules.includes(module))
    throw new ERPNextError("This tool is not assigned to this agent.", 403)
  const config = platformConfig().modules.find(
    (m) => m.id === module && m.readValidated,
  )
  if (!config?.aiFields.length)
    throw new ERPNextError("This AI data source is awaiting validation.", 409)
  return config
}
export function collectionAccess(
  context: UserContext,
  collection: string,
  upload = false,
) {
  const config = platformConfig().collections.find((c) => c.id === collection)
  if (
    !config?.approvedForAI ||
    !(upload ? config.uploadRoles : config.roles).some((r) =>
      context.roles.includes(r),
    )
  )
    throw new ERPNextError(
      "This document collection is not available to your account.",
      403,
    )
  return config
}
