import { humanTool } from "@/lib/mcp/human-tool"
import { workspaceAdapters, workspaceSchema } from "@/lib/workspace-server"
import { nativeModule } from "@/lib/erp-native/catalog"
import {
  queryCompany,
  workspaceError,
  workspaceResponse,
} from "@/lib/workspace-http"
export const dynamic = "force-dynamic"
export async function GET(
  request: Request,
  context: { params: Promise<{ moduleId: string }> },
) {
  try {
    const { moduleId } = await context.params
    return workspaceResponse(
      Object.hasOwn(workspaceAdapters, moduleId) && !nativeModule(moduleId)
        ? await humanTool(queryCompany(request), "workspace_schema", {
            module: moduleId,
          })
        : await workspaceSchema(moduleId, queryCompany(request)),
    )
  } catch (cause) {
    return workspaceError(cause)
  }
}
