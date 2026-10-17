import { ERPWorkspace } from "@/components/erp-workspace"
import { customReports, workspaceCatalog } from "@/lib/workspace-server"

export const dynamic = "force-dynamic"
export default async function Page() {
  return <ERPWorkspace modules={workspaceCatalog()} reports={customReports} />
}
