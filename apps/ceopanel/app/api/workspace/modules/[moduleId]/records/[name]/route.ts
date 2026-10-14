import { workspaceGet, workspaceSave } from "@/lib/workspace-server"
import {
  queryCompany,
  workspaceBody,
  workspaceError,
  workspaceResponse,
} from "@/lib/workspace-http"
export const dynamic = "force-dynamic"
type Context = { params: Promise<{ moduleId: string; name: string }> }
export async function GET(request: Request, context: Context) {
  try {
    const { moduleId, name } = await context.params
    return workspaceResponse(
      await workspaceGet(moduleId, name, queryCompany(request))
    )
  } catch (cause) {
    return workspaceError(cause)
  }
}
export async function PUT(request: Request, context: Context) {
  try {
    const body = await workspaceBody(request)
    const { moduleId, name } = await context.params
    return workspaceResponse(
      await workspaceSave(moduleId, queryCompany(request), {
        name,
        values: body.values,
        modified: typeof body.modified === "string" ? body.modified : undefined,
      })
    )
  } catch (cause) {
    return workspaceError(cause)
  }
}
