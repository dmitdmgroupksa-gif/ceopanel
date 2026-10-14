import { workspaceReport } from "@/lib/workspace-server"
import {
  queryCompany,
  workspaceBody,
  workspaceError,
  workspaceResponse,
} from "@/lib/workspace-http"
export const dynamic = "force-dynamic"
export async function POST(
  request: Request,
  context: { params: Promise<{ reportId: string }> }
) {
  try {
    const body = await workspaceBody(request)
    const { reportId } = await context.params
    return workspaceResponse(
      await workspaceReport(reportId, queryCompany(request), body.filters)
    )
  } catch (cause) {
    return workspaceError(cause)
  }
}
