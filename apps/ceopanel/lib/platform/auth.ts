import "server-only"
import { loadContext } from "../dashboard-server"
import { client } from "../erpnext-server"
import { ERPNextError } from "../erpnext-client"
import type { UserContext } from "./policy"
export {
  agentAccess,
  moduleAccess,
  collectionAccess,
  type UserContext,
} from "./policy"
export async function identity(company?: string): Promise<UserContext> {
  const context = await loadContext(company)
  const roles = context.roles ?? (await (await client()).roles())
  if (!Array.isArray(roles) || roles.some((r) => typeof r !== "string"))
    throw new ERPNextError("ERP role configuration is invalid.")
  return { ...context, roles }
}
