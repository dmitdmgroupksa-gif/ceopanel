import { workspaceSchema } from "@/lib/workspace-server"
import {
  queryCompany,
  workspaceError,
  workspaceResponse,
} from "@/lib/workspace-http"
export const dynamic = "force-dynamic"
export async function GET(
  request: Request,
  context: { params: Promise<{ moduleId: string }> }
) {
  try {
    const { moduleId } = await context.params
    return workspaceResponse(
      await workspaceSchema(moduleId, queryCompany(request))
    )
  } catch (cause) {
    return workspaceError(cause)
  }
}
