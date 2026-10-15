import "server-only"
import { platformConfig } from "./config"
import { inputCategories } from "./input-catalog"
import { agentAccess, type UserContext } from "./policy"
import { externalCatalog } from "./external"
export function inputReadiness(context: UserContext) {
  const config = platformConfig()
  const manager = context.roles.includes("System Manager")
  const permitted = new Set<string>()
  for (const id of Object.keys(config.agents)) {
    try {
      for (const module of agentAccess(context, id).mapping.modules)
        permitted.add(module)
    } catch {}
  }
  return {
    primary: "erpnext",
    verification: "configuration_inventory_only",
    categories: inputCategories.map((category) => {
      const visible = category.modules.filter(
        (id) => manager || permitted.has(id),
      )
      const mappedCount =
        category.id === "documents"
          ? config.collections.filter(
              (c) =>
                c.approvedForAI &&
                c.roles.some((r) => context.roles.includes(r)),
            ).length
          : visible.filter((id) =>
              config.modules.some((m) => m.id === id && m.readValidated),
            ).length
      return {
        id: category.id,
        title: category.title,
        ar: category.ar,
        route: category.route,
        mappedCount,
        modules: visible.map((id) => {
          const module = config.modules.find((m) => m.id === id)
          return {
            id,
            state: module?.readValidated
              ? "validated_mapping"
              : "awaiting_mapping",
          }
        }),
        state: mappedCount ? "mapped_awaiting_live_check" : "awaiting_mapping",
        ...(manager ? { discoveryCandidates: category.extra } : {}),
      }
    }),
    external: externalCatalog(context),
  }
}
