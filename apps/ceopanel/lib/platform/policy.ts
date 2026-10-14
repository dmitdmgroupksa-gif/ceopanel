import { ERPNextError } from "../erpnext-client"
import { platformConfig } from "./config"
import { agents, type AgentId } from "./catalog"
import type { DashboardContext } from "../dashboard-server"
export type UserContext = DashboardContext & { roles: string[] }
export function agentAccess(context: UserContext, id: string) {
  const agent = agents.find((a) => a.id === id),
    mapping = platformConfig().agents[id]
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
