import type { z } from "zod"
import type { UserContext } from "../platform/policy"
import type { AgentId } from "../platform/catalog"
export type ToolScope = {
  context: UserContext
  principal: "agent" | "human"
  agent?: AgentId
  grantId?: string
  canPropose?: boolean
  erpRead?: boolean
  evidence: unknown[]
}
export type PluginTool = {
  name: string
  title?: string
  description: string
  schema: z.ZodObject
  audience: "agent" | "human" | "both"
  effect: "read" | "proposal" | "write" | "approval"
  requiresERPRead?: boolean
  run: (scope: ToolScope, input: any) => Promise<unknown>
}
export type BusinessPlugin = {
  id: string
  title: string
  version: string
  tools: PluginTool[]
}
