import { humanTool } from "@/lib/mcp/human-tool"
import { nativeModule } from "@/lib/erp-native/catalog"
import { workspaceGet } from "@/lib/workspace-server"
import { denyERPWrite } from "@/lib/erp-access"
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
      nativeModule(moduleId)
        ? await workspaceGet(moduleId, name, queryCompany(request))
        : await humanTool(queryCompany(request), "workspace_record", {
            module: moduleId,
            name,
          }),
    )
  } catch (cause) {
    return workspaceError(cause)
  }
}
export async function PUT(request: Request, context: Context) {
  try {
    denyERPWrite()
    const body = await workspaceBody(request)
    const { moduleId, name } = await context.params
    return workspaceResponse(
      await humanTool(queryCompany(request), "workspace_save", {
        module: moduleId,
        name,
        values: body.values,
        modified: typeof body.modified === "string" ? body.modified : undefined,
      }),
    )
  } catch (cause) {
    return workspaceError(cause)
  }
}
