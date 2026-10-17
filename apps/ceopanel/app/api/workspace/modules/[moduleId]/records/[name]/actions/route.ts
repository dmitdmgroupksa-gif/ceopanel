import { humanTool } from "@/lib/mcp/human-tool"
import { denyERPWrite } from "@/lib/erp-access"
import {
  queryCompany,
  workspaceBody,
  workspaceError,
  workspaceResponse,
} from "@/lib/workspace-http"
export const dynamic = "force-dynamic"
export async function POST(
  request: Request,
  context: { params: Promise<{ moduleId: string; name: string }> },
) {
  try {
    denyERPWrite()
    const body = await workspaceBody(request)
    const { moduleId, name } = await context.params
    return workspaceResponse(
      await humanTool(queryCompany(request), "workspace_action", {
        module: moduleId,
        name,
        action: String(body.action || ""),
        modified: String(body.modified || ""),
      }),
    )
  } catch (cause) {
    return workspaceError(cause)
  }
}
