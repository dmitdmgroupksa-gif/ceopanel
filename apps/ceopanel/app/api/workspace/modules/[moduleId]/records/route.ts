import { humanTool } from "@/lib/mcp/human-tool"
import { nativeModule } from "@/lib/erp-native/catalog"
import { workspaceList } from "@/lib/workspace-server"
import { denyERPWrite } from "@/lib/erp-access"
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
      nativeModule(moduleId)
        ? await workspaceList(moduleId, queryCompany(request), {
            search: query.get("search") || "",
            offset: Number(query.get("offset") || 0),
            limit: Number(query.get("limit") || 20),
          })
        : await humanTool(queryCompany(request), "workspace_list", {
            module: moduleId,
            search: query.get("search") || "",
            offset: Number(query.get("offset") || 0),
            limit: Number(query.get("limit") || 20),
          }),
    )
  } catch (cause) {
    return workspaceError(cause)
  }
}
export async function POST(request: Request, context: Context) {
  try {
    denyERPWrite()
    const body = await workspaceBody(request)
    const { moduleId } = await context.params
    return workspaceResponse(
      await humanTool(queryCompany(request), "workspace_save", {
        module: moduleId,
        values: body.values,
      }),
      201,
    )
  } catch (cause) {
    return workspaceError(cause)
  }
}
