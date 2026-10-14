import { cookies } from "next/headers"
import { ERPWorkspace } from "@/components/erp-workspace"
import { loadContext, type DashboardContext } from "@/lib/dashboard-server"
import { companyName, SESSION_COOKIE, siteUrl } from "@/lib/erpnext-server"
import { customReports, workspaceCatalog } from "@/lib/workspace-server"

export const dynamic = "force-dynamic"
export default async function Page() {
  let initial: DashboardContext | null = null
  let error: string | null = null
  if ((await cookies()).has(SESSION_COOKIE)) {
    try {
      initial = await loadContext()
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "ERPNext connection could not be loaded."
    }
  }
  return (
    <ERPWorkspace
      modules={workspaceCatalog()}
      reports={customReports}
      initial={initial}
      initialError={error}
      config={{ companyName, siteUrl: siteUrl() }}
    />
  )
}
