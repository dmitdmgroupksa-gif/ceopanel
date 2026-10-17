import { humanTool } from "@/lib/mcp/human-tool"
import {
  queryCompany,
  workspaceBody,
  workspaceError,
  workspaceResponse,
} from "@/lib/workspace-http"
export const dynamic = "force-dynamic"
export async function POST(
  request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  try {
    const body = await workspaceBody(request)
    const { reportId } = await context.params
    return workspaceResponse(
      await humanTool(queryCompany(request), "workspace_report", {
        report: reportId,
        filters: body.filters || {},
      }),
    )
  } catch (cause) {
    return workspaceError(cause)
  }
}
