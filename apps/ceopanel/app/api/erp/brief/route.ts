import { identity } from "@/lib/platform/auth"
import { dailyBrief } from "@/lib/erp-native/brief"
import {
  queryCompany,
  workspaceError,
  workspaceResponse,
} from "@/lib/workspace-http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  try {
    return workspaceResponse(
      await dailyBrief(await identity(queryCompany(request))),
    )
  } catch (error) {
    return workspaceError(error)
  }
}
