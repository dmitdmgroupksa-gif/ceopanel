import { identity } from "@/lib/platform/auth"
import { client } from "@/lib/erpnext-server"
import { explore } from "@/lib/erp-native/explorer"
import {
  workspaceBody,
  workspaceError,
  workspaceResponse,
} from "@/lib/workspace-http"
import { ERPNextError } from "@/lib/erpnext-error"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// POST carries read filters, never ERP mutations, and avoids putting private
// search/report criteria into URLs and access logs. Only fixed read actions exist.
export async function POST(request: Request) {
  try {
    const body = await workspaceBody(request)
    const { company, ...input } = body
    if (
      company !== undefined &&
      (typeof company !== "string" || company.length > 180)
    )
      throw new ERPNextError("Invalid company.", 400)
    const context = await identity(company as string | undefined)
    return workspaceResponse(await explore(context, input, await client()))
  } catch (error) {
    return workspaceError(error)
  }
}
