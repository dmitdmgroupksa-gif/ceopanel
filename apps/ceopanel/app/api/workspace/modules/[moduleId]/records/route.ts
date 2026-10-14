import { workspaceList, workspaceSave } from "@/lib/workspace-server"
import {
  queryCompany,
  workspaceBody,
  workspaceError,
  workspaceResponse,
} from "@/lib/workspace-http"
export const dynamic = "force-dynamic"
type Context = { params: Promise<{ moduleId: string }> }
export async function GET(request: Request, context: Context) {
  try {
    const { moduleId } = await context.params
    const query = new URL(request.url).searchParams
    return workspaceResponse(
      await workspaceList(moduleId, queryCompany(request), {
        search: query.get("search") || "",
        offset: Number(query.get("offset") || 0),
        limit: Number(query.get("limit") || 20),
      })
    )
  } catch (cause) {
    return workspaceError(cause)
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const body = await workspaceBody(request)
    const { moduleId } = await context.params
    return workspaceResponse(
      await workspaceSave(moduleId, queryCompany(request), {
        values: body.values,
      }),
      201
    )
  } catch (cause) {
    return workspaceError(cause)
  }
}
