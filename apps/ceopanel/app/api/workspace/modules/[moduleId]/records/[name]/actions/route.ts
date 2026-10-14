import { workspaceAction } from "@/lib/workspace-server"
import {
  queryCompany,
  workspaceBody,
  workspaceError,
  workspaceResponse,
} from "@/lib/workspace-http"
export const dynamic = "force-dynamic"
export async function POST(
  request: Request,
  context: { params: Promise<{ moduleId: string; name: string }> }
) {
  try {
    const body = await workspaceBody(request)
    const { moduleId, name } = await context.params
    return workspaceResponse(
      await workspaceAction(
        moduleId,
        name,
        queryCompany(request),
        String(body.action || ""),
        String(body.modified || "")
      )
    )
  } catch (cause) {
    return workspaceError(cause)
  }
}
