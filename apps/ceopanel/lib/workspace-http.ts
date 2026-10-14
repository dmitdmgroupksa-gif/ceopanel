import "server-only"
import { NextResponse } from "next/server"
import { ERPNextError } from "./erpnext-client"
import { validOrigin } from "./erpnext-server"
export const workspaceHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
}
export function workspaceResponse(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: workspaceHeaders })
}
export function workspaceError(cause: unknown) {
  return workspaceResponse(
    {
      error:
        cause instanceof ERPNextError
          ? cause.message
          : "The ERPNext operation could not be completed.",
    },
    cause instanceof ERPNextError ? cause.status : 502
  )
}
export async function workspaceBody(request: Request) {
  if (!validOrigin(request))
    throw new ERPNextError(
      "This request must come from your company workspace.",
      403
    )
  const text = await request.text()
  if (text.length > 200000)
    throw new ERPNextError("This record is too large to save here.", 413)
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error()
    return value as Record<string, unknown>
  } catch {
    throw new ERPNextError("Invalid request data.", 400)
  }
}
export function queryCompany(request: Request) {
  return new URL(request.url).searchParams.get("company") || undefined
}
