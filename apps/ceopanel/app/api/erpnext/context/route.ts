import { NextResponse } from "next/server"
import { loadContext } from "@/lib/dashboard-server"
import { ERPNextError } from "@/lib/erpnext-client"
import { SESSION_COOKIE } from "@/lib/auth-navigation"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" }
  try {
    return NextResponse.json(
      await loadContext(
        new URL(request.url).searchParams.get("company") || undefined,
      ),
      { headers },
    )
  } catch (cause) {
    const response = NextResponse.json(
      {
        error:
          cause instanceof ERPNextError
            ? cause.message
            : "ERPNext connection could not be loaded.",
      },
      { status: cause instanceof ERPNextError ? cause.status : 502, headers },
    )
    if (response.status === 401) response.cookies.delete(SESSION_COOKIE)
    return response
  }
}
